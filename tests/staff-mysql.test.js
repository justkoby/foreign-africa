import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDB} from 'mysql-memory-server';
import {createPool} from '../server/db.js';
import {migrate, migrationsDirectory} from '../server/migrate.js';
import {createApp} from '../server/app.js';
import {provisionAdmin} from '../server/store.js';

const password = 'correct-horse-battery';

function listen(app) {
  return new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => resolve({server, url: `http://127.0.0.1:${server.address().port}`}));
  });
}

async function call(url, path, {method = 'GET', body, cookie, origin = 'http://127.0.0.1:9'} = {}) {
  const response = await fetch(`${url}${path}`, {method, headers: {'Content-Type': 'application/json', Origin: origin, ...(cookie ? {Cookie: cookie} : {})}, body: body === undefined ? undefined : JSON.stringify(body)});
  const data = await response.json().catch(() => ({}));
  const cookieHeader = response.headers.get('set-cookie') || '';
  const staff = cookieHeader.split(';')[0].startsWith('fa_staff=') ? cookieHeader.split(';')[0] : cookie;
  return {status: response.status, data, cookie: staff};
}

test('mysql staff foundation', {timeout: 300000}, async (t) => {
  let database;
  try {
    database = await createDB({version: '8.4.x'});
  } catch (error) {
    return t.skip(`MySQL 8 could not be started: ${error.message}`);
  }
  const pool = createPool({dbHost: '127.0.0.1', dbPort: database.port, dbUser: database.username, dbPassword: '', dbName: database.dbName});
  const config = {appEnv: 'test', publicSiteUrl: 'http://127.0.0.1:9', sessionSecret: 'test-secret', cookieSecure: false, passwordCost: 4, mediaRoot: '', stagingUser: '', stagingPassword: ''};
  let now = Date.parse('2026-10-25T12:00:00Z');
  const clock = () => now;
  t.after(async () => {await pool.end(); await database.stop();});

  await t.test('migrations apply once and a failed migration is not recorded', async () => {
    const first = await migrate({pool, directory: migrationsDirectory});
    assert.equal(first.length, 4);
    assert.deepEqual(await migrate({pool, directory: migrationsDirectory}), []);
    const [roles] = await pool.execute('SELECT COUNT(*) AS n FROM roles');
    assert.equal(Number(roles[0].n), 4);
    const directory = mkdtempSync(join(tmpdir(), 'fa-bad-migration-'));
    writeFileSync(join(directory, '009_bad.sql'), 'SELECT * FROM table_that_is_not_there;');
    await assert.rejects(() => migrate({pool, directory}), /009_bad/);
    const [rows] = await pool.execute('SELECT id FROM schema_migrations WHERE id = ?', ['009_bad']);
    assert.equal(rows.length, 0);
  });

  await t.test('accounts, roles, publishing, and public visibility', async () => {
    await provisionAdmin({pool, config, clock, email: 'ada@foreignafrica.org', name: 'Ada Admin', password});
    await assert.rejects(() => provisionAdmin({pool, config, clock, email: 'other@foreignafrica.org', name: 'Other', password}), /already exists/);
    const app = createApp({config, pool, clock});
    const {server, url} = await listen(app);
    try {
      const unknown = await call(url, '/api/staff/login', {method: 'POST', body: {email: 'missing@foreignafrica.org', password}});
      const wrong = await call(url, '/api/staff/login', {method: 'POST', body: {email: 'ada@foreignafrica.org', password: 'wrong-password'}});
      assert.equal(unknown.status, 401);
      assert.equal(wrong.status, 401);
      assert.equal(unknown.data.error, wrong.data.error);
      const admin = await call(url, '/api/staff/login', {method: 'POST', body: {email: 'ada@foreignafrica.org', password}});
      assert.equal(admin.status, 200);
      const contributor = await call(url, '/api/staff/users', {method: 'POST', cookie: admin.cookie, body: {name: 'Cori Contributor', email: 'cori@foreignafrica.org', role: 'contributor', password}});
      const editor = await call(url, '/api/staff/users', {method: 'POST', cookie: admin.cookie, body: {name: 'Eden Editor', email: 'eden@foreignafrica.org', role: 'editor', password}});
      assert.equal(contributor.status, 201, JSON.stringify(contributor.data));
      assert.equal(editor.status, 201);
      const cori = await call(url, '/api/staff/login', {method: 'POST', body: {email: 'cori@foreignafrica.org', password}});
      const eden = await call(url, '/api/staff/login', {method: 'POST', body: {email: 'eden@foreignafrica.org', password}});
      const draft = await call(url, '/api/staff/content', {method: 'POST', cookie: cori.cookie, body: {type: 'news', title: 'A real headline', summary: 'Summary', body: 'The article body'}});
      assert.equal(draft.status, 201);
      const denied = await call(url, `/api/staff/content/${draft.data.item.id}/state`, {method: 'POST', cookie: cori.cookie, body: {status: 'published'}});
      assert.equal(denied.status, 403);
      const published = await call(url, `/api/staff/content/${draft.data.item.id}/state`, {method: 'POST', cookie: eden.cookie, body: {status: 'published'}});
      assert.equal(published.status, 200);
      const html = await fetch(`${url}/api/public/content/news/a-real-headline?format=html`);
      assert.equal(html.status, 200);
      assert.match(await html.text(), /The article body/);
      const hidden = await call(url, '/api/staff/content', {method: 'POST', cookie: cori.cookie, body: {type: 'news', title: 'Still private', body: 'Secret draft'}});
      assert.equal((await call(url, `/api/public/content/news/${hidden.data.item.slug}`)).status, 404);
      const other = await call(url, `/api/staff/content/${hidden.data.item.id}`, {method: 'PATCH', cookie: eden.cookie, body: {title: 'Edited by an editor'}});
      assert.equal(other.status, 200);
      const scheduled = await call(url, '/api/staff/content', {method: 'POST', cookie: eden.cookie, body: {type: 'commentary', title: 'Later piece', body: 'Not yet'}});
      const future = new Date(now + 60 * 60 * 1000).toISOString();
      assert.equal((await call(url, `/api/staff/content/${scheduled.data.item.id}/state`, {method: 'POST', cookie: eden.cookie, body: {status: 'scheduled', publishedAt: future}})).status, 200);
      assert.equal((await call(url, '/api/public/content/commentary/later-piece')).status, 404);
      now += 2 * 60 * 60 * 1000;
      assert.equal((await call(url, '/api/staff/schedule/run', {method: 'POST', cookie: eden.cookie, body: {}})).data.promoted, 1);
      assert.equal((await call(url, '/api/public/content/commentary/later-piece')).status, 200);
      const odd = await call(url, '/api/staff/content', {method: 'POST', cookie: eden.cookie, body: {type: 'page', title: "O'Hare & <script>", body: 'ok'}});
      assert.equal(odd.status, 201);
      assert.equal((await call(url, `/api/staff/content/${odd.data.item.id}` , {cookie: eden.cookie})).data.item.title, "O'Hare & <script>");
      assert.equal((await call(url, '/api/staff/content', {method: 'POST', cookie: cori.cookie, body: {type: 'news', title: 'x'}})).status, 400);
      const edenDraft = await call(url, '/api/staff/content', {method: 'POST', cookie: eden.cookie, body: {type: 'page', title: 'Editor only note', body: 'private'}});
      assert.equal((await call(url, `/api/staff/content/${edenDraft.data.item.id}`, {method: 'PATCH', cookie: cori.cookie, body: {title: 'Taken over'}})).status, 403);
      for (let attempt = 0; attempt < 8; attempt += 1) await call(url, '/api/staff/login', {method: 'POST', body: {email: 'locked@foreignafrica.org', password: 'nope-nope-nope'}});
      assert.equal((await call(url, '/api/staff/login', {method: 'POST', body: {email: 'locked@foreignafrica.org', password: 'nope-nope-nope'}})).status, 429);
      assert.equal((await call(url, `/api/staff/content/${draft.data.item.id}`, {method: 'DELETE', cookie: cori.cookie})).status, 403);
      await call(url, '/api/staff/logout', {method: 'POST', cookie: cori.cookie, body: {}});
      assert.equal((await call(url, '/api/staff/session', {cookie: cori.cookie})).data.user, null);
      now += 8 * 24 * 60 * 60 * 1000;
      assert.equal((await call(url, '/api/staff/session', {cookie: admin.cookie})).data.user, null);
      const [activity] = await pool.execute('SELECT metadata FROM activity_logs');
      assert.equal(JSON.stringify(activity).includes(password), false);
    } finally {await new Promise(resolve => server.close(resolve));}
  });
});
