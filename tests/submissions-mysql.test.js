import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDisposableMysql} from './helpers/mysql.js';
import {createPool} from '../server/db.js';
import {migrate, migrationsDirectory} from '../server/migrate.js';
import {createApp} from '../server/app.js';
import {provisionAdmin} from '../server/store.js';
import {importLegacySubmissions} from '../server/submissions.js';
import {exportTables, importTables} from '../server/backup.js';

const password = 'correct-horse-battery';
const forms = [{id: 'general_enquiry', title: 'General enquiry', status: 'publish', success: 'Thank you.', fields: [
  {id: 'name', label: 'Your name', type: 'text', required: true},
  {id: 'email', label: 'Email address', type: 'email', required: true},
  {id: 'message', label: 'Message', type: 'textarea', required: true},
]}, {id: 'closed', title: 'Closed', status: 'draft', fields: [{id: 'email', label: 'Email', type: 'email', required: true}]}];

const listen = app => new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve({server, url: `http://127.0.0.1:${server.address().port}`})); });
async function call(url, path, {method = 'GET', body, cookie, origin = 'http://127.0.0.1:9', raw} = {}) {
  const response = await fetch(`${url}${path}`, {method, headers: {'Content-Type': 'application/json', Origin: origin, ...(cookie ? {Cookie: cookie} : {})}, body: body === undefined ? undefined : JSON.stringify(body)});
  const text = await response.text();
  let data = {}; try { data = JSON.parse(text); } catch { /* not JSON */ }
  const set = (response.headers.get('set-cookie') || '').split(';')[0];
  return {status: response.status, data, text: raw ? text : undefined, headers: response.headers, cookie: set.startsWith('fa_staff=') ? set : cookie};
}

test('submissions, consolidated /api/cms and lazy scheduling (real MySQL)', {timeout: 300000}, async t => {
  let database;
  try { database = await createDisposableMysql(); } catch (error) { return t.skip(`MySQL could not be started: ${error.message}`); }
  const pool = createPool({dbHost: '127.0.0.1', dbPort: database.port, dbUser: database.username, dbPassword: '', dbName: database.dbName});
  const config = {appEnv: 'test', publicSiteUrl: 'http://127.0.0.1:9', sessionSecret: 'test-secret', cookieSecure: false, passwordCost: 4, mediaRoot: '', stagingUser: '', stagingPassword: '', legacyFileEditing: false};
  let now = Date.parse('2026-10-25T12:00:00Z');
  const clock = () => now;
  t.after(async () => { await pool.end(); await database.stop(); });

  assert.equal((await migrate({pool, directory: migrationsDirectory})).length, 5);
  await provisionAdmin({pool, config, clock, email: 'ada@foreignafrica.org', name: 'Ada Admin', password});
  const app = createApp({config, pool, clock, forms: () => forms});
  const {server, url} = await listen(app);
  t.after(() => server.close());
  const login = async email => (await call(url, '/api/staff/login', {method: 'POST', body: {email, password}})).cookie;
  const admin = await login('ada@foreignafrica.org');
  for (const [name, email, role] of [['Eden Editor', 'eden@foreignafrica.org', 'editor'], ['Cori Contributor', 'cori@foreignafrica.org', 'contributor'], ['Amy Admin', 'amy@foreignafrica.org', 'admin']]) {
    assert.equal((await call(url, '/api/staff/users', {method: 'POST', cookie: admin, body: {name, email, role, password}})).status, 201);
  }
  const editor = await login('eden@foreignafrica.org');
  const contributor = await login('cori@foreignafrica.org');
  const amy = await login('amy@foreignafrica.org');

  await t.test('public submit validates on the server and stores privately', async () => {
    const good = {formId: 'general_enquiry', key: 'k-1', answers: {name: 'Zainab Test', email: 'zainab@example.org', message: '=HYPERLINK("http://x.example")'}};
    const bad = await call(url, '/api/cms/submit', {method: 'POST', body: {...good, key: 'k-bad', answers: {name: '', email: 'nope', message: 'x'}}});
    assert.equal(bad.status, 400); assert.ok(bad.data.errors.email && bad.data.errors.name);
    assert.equal((await call(url, '/api/cms/submit', {method: 'POST', body: {formId: 'closed', answers: {email: 'a@b.co'}}})).status, 404);
    assert.equal((await call(url, '/api/cms/submit', {method: 'POST', body: good, origin: 'https://evil.example'})).status, 403);
    const ok = await call(url, '/api/cms/submit', {method: 'POST', body: good});
    assert.equal(ok.status, 200); assert.match(ok.data.reference, /^FA-/);
    const again = await call(url, '/api/cms/submit', {method: 'POST', body: good});
    assert.equal(again.data.reference, ok.data.reference, 'a retried submission is not stored twice');
    const [[count]] = await pool.query('SELECT COUNT(*) AS n FROM submissions');
    assert.equal(Number(count.n), 1);
    assert.equal((await call(url, '/api/public/content?type=news')).text, undefined);
  });

  await t.test('submission access is restricted to administrators', async () => {
    for (const [who, cookie] of [['anonymous', undefined], ['contributor', contributor], ['editor', editor]]) {
      const list = await call(url, '/api/staff/submissions', {cookie});
      assert.equal(list.status, cookie ? 403 : 401, who);
      assert.equal((await call(url, '/api/staff/submissions/1', {cookie})).status, cookie ? 403 : 401, who);
      assert.equal((await call(url, '/api/staff/submissions.csv', {cookie})).status, cookie ? 403 : 401, who);
      assert.equal((await call(url, '/api/staff/submissions/1', {method: 'PATCH', cookie, body: {status: 'actioned'}})).status, cookie ? 403 : 401, who);
    }
    const list = await call(url, '/api/staff/submissions', {cookie: amy});
    assert.equal(list.status, 200); assert.equal(list.data.total, 1);
    assert.equal(list.data.items[0].answers.email, 'zainab@example.org');
  });

  await t.test('status, assignment and notes work and are audited without personal data', async () => {
    const id = (await call(url, '/api/staff/submissions', {cookie: amy})).data.items[0].id;
    assert.equal((await call(url, `/api/staff/submissions/${id}`, {method: 'PATCH', cookie: amy, body: {status: 'bogus'}})).status, 400);
    assert.equal((await call(url, `/api/staff/submissions/${id}`, {method: 'PATCH', cookie: amy, body: {assignedTo: 99999}})).status, 400);
    const users = (await call(url, '/api/staff/users', {cookie: admin})).data.users;
    const eden = users.find(u => u.email === 'eden@foreignafrica.org');
    assert.equal((await call(url, `/api/staff/submissions/${id}`, {method: 'PATCH', cookie: amy, body: {assignedTo: eden.id}})).status, 400, 'editors cannot be assigned applicant data');
    const updated = await call(url, `/api/staff/submissions/${id}`, {method: 'PATCH', cookie: amy, body: {status: 'in_review', assignedTo: users.find(u => u.email === 'amy@foreignafrica.org').id}});
    assert.equal(updated.status, 200); assert.equal(updated.data.item.status, 'in_review');
    const noted = await call(url, `/api/staff/submissions/${id}/notes`, {method: 'POST', cookie: amy, body: {note: 'Called back, awaiting documents.'}});
    assert.equal(noted.status, 201); assert.equal(noted.data.item.notes.length, 1);
    assert.equal((await call(url, `/api/staff/submissions/${id}/notes`, {method: 'POST', cookie: amy, body: {note: '   '}})).status, 400);
    const csv = await call(url, '/api/staff/submissions.csv', {cookie: amy, raw: true});
    assert.equal(csv.status, 200); assert.match(csv.headers.get('content-type'), /text\/csv/);
    assert.match(csv.text, /"'=HYPERLINK/, 'formula cells are defused');
    const [logs] = await pool.query("SELECT action, metadata FROM activity_logs WHERE subject_type = 'submission' ORDER BY id");
    const actions = logs.map(l => l.action);
    for (const expected of ['submission.created', 'submission.listed', 'submission.viewed', 'submission.updated', 'submission.noted', 'submission.exported']) assert.ok(actions.includes(expected), expected);
    const everything = JSON.stringify(logs);
    for (const secret of ['zainab', 'Zainab', 'HYPERLINK', 'awaiting documents']) assert.ok(!everything.includes(secret), `audit log must not contain "${secret}"`);
  });

  await t.test('the old file submissions import once and leave the file alone', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'fa-legacy-')), 'submissions.json');
    writeFileSync(file, JSON.stringify([{reference: 'FA-OLD1', formId: 'general_enquiry', key: 'old-1', submittedAt: '2026-09-01T10:00:00Z', answers: {name: 'Old One', email: 'old@example.org', message: 'From the file'}}, {reference: 'FA-OLD2', formId: 'gone', key: 'old-2', submittedAt: '2026-09-02T10:00:00Z', answers: {}}]));
    const first = await importLegacySubmissions({pool, clock, secret: 'test-secret', file, forms});
    const second = await importLegacySubmissions({pool, clock, secret: 'test-secret', file, forms});
    assert.deepEqual([first.imported, first.missingForm], [1, 1]);
    assert.deepEqual([second.imported, second.skipped], [0, 1]);
    const [[row]] = await pool.query("SELECT created_at FROM submissions WHERE reference = 'FA-OLD1'");
    assert.equal(new Date(row.created_at).toISOString().slice(0, 10), '2026-09-01');
  });

  await t.test('/api/cms needs a Studio session and role; the shared password no longer works', async () => {
    assert.equal((await call(url, '/api/cms/items?collection=events')).status, 401);
    assert.equal((await call(url, '/api/cms/items?collection=events', {cookie: contributor})).status, 403);
    assert.equal((await call(url, '/api/cms/items?collection=events', {cookie: editor})).status, 200);
    assert.equal((await call(url, '/api/cms/login', {method: 'POST', body: {password: 'anything'}})).status, 410);
    assert.equal((await call(url, '/api/cms/submissions', {cookie: admin})).status, 410, 'submissions are no longer readable through the legacy route');
    const write = await call(url, '/api/cms/items', {method: 'PUT', cookie: editor, body: {collection: 'events', item: {title: 'Should not be written'}}});
    assert.equal(write.status, 403);
    const forged = await call(url, '/api/cms/items', {method: 'PUT', cookie: editor, origin: 'https://evil.example', body: {collection: 'events', item: {title: 'x'}}});
    assert.equal(forged.status, 403);
  });

  await t.test('scheduled content becomes public when due, with no worker or cron', async () => {
    const created = await call(url, '/api/staff/content', {method: 'POST', cookie: editor, body: {type: 'news', title: 'Due soon', summary: 'S', body: 'Body'}});
    const future = new Date(now + 3600_000).toISOString();
    assert.equal((await call(url, `/api/staff/content/${created.data.item.id}/state`, {method: 'POST', cookie: editor, body: {status: 'scheduled', publishedAt: future}})).status, 200);
    assert.equal((await call(url, '/api/public/content/news/due-soon')).status, 404);
    now += 2 * 3600_000;
    assert.equal((await call(url, '/api/public/content/news/due-soon')).status, 200, 'visible as soon as the time passes, before any promotion');
    const listed = await call(url, '/api/public/content?type=news');
    assert.ok(listed.data.items.some(i => i.slug === 'due-soon'));
    const [[row]] = await pool.query("SELECT status FROM content_items WHERE slug = 'due-soon'");
    assert.equal(row.status, 'published', 'the status was also tidied by the throttled promotion');
  });

  await t.test('the app-level backup includes submissions and restores them intact', async () => {
    const dump = await exportTables(pool);
    for (const table of ['forms', 'submissions', 'submission_notes']) assert.ok(Array.isArray(dump[table]), `${table} is part of the backup`);
    const before = dump.submissions.length;
    assert.ok(before >= 2);
    await importTables(pool, JSON.parse(JSON.stringify(dump)));
    const [[after]] = await pool.query('SELECT COUNT(*) AS n FROM submissions');
    assert.equal(Number(after.n), before);
    const [[note]] = await pool.query('SELECT COUNT(*) AS n FROM submission_notes');
    assert.equal(Number(note.n), dump.submission_notes.length);
    const [[answers]] = await pool.query("SELECT JSON_UNQUOTE(JSON_EXTRACT(payload, '$.answers.email')) AS email FROM submissions WHERE reference = 'FA-OLD1'");
    assert.equal(answers.email, 'old@example.org');
  });
});
