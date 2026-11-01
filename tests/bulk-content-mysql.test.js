import test from 'node:test';
import assert from 'node:assert/strict';
import {createDisposableMysql} from './helpers/mysql.js';
import {createPool} from '../server/db.js';
import {migrate, migrationsDirectory} from '../server/migrate.js';
import {createApp} from '../server/app.js';
import {provisionAdmin} from '../server/store.js';

const password = 'correct-horse-battery';
async function call(url, path, {method = 'GET', body, cookie} = {}) {
  const response = await fetch(`${url}${path}`, {method, headers: {'Content-Type': 'application/json', Origin: 'http://127.0.0.1:9', ...(cookie ? {Cookie: cookie} : {})}, body: body === undefined ? undefined : JSON.stringify(body)});
  const set = (response.headers.get('set-cookie') || '').split(';')[0];
  return {status: response.status, data: await response.json().catch(() => ({})), cookie: set.startsWith('fa_staff=') ? set : cookie};
}

test('bulk actions respect per-item permissions and report each outcome', {timeout: 300000}, async t => {
  let database;
  try { database = await createDisposableMysql(); } catch (error) { return t.skip(`Database could not be started: ${error.message}`); }
  const pool = createPool({dbHost: '127.0.0.1', dbPort: database.port, dbUser: database.username, dbPassword: '', dbName: database.dbName});
  const config = {appEnv: 'test', publicSiteUrl: 'http://127.0.0.1:9', sessionSecret: 'test-secret', cookieSecure: false, passwordCost: 4, mediaRoot: '', stagingUser: '', stagingPassword: '', legacyFileEditing: false};
  const clock = () => Date.parse('2026-10-25T12:00:00Z');
  await migrate({pool, directory: migrationsDirectory});
  await provisionAdmin({pool, config, clock, email: 'ada@foreignafrica.org', name: 'Ada Admin', password});
  const server = await new Promise(resolve => { const s = createApp({config, pool, clock}).listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(async () => { server.close(); await pool.end(); await database.stop(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const login = async email => (await call(url, '/api/staff/login', {method: 'POST', body: {email, password}})).cookie;
  const admin = await login('ada@foreignafrica.org');
  for (const [name, email, role] of [['Eden Editor', 'eden@foreignafrica.org', 'editor'], ['Cori Contributor', 'cori@foreignafrica.org', 'contributor']]) await call(url, '/api/staff/users', {method: 'POST', cookie: admin, body: {name, email, role, password}});
  const editor = await login('eden@foreignafrica.org');
  const contributor = await login('cori@foreignafrica.org');
  const make = async (cookie, title) => (await call(url, '/api/staff/content', {method: 'POST', cookie, body: {type: 'news', title, summary: 'S', body: 'B'}})).data.item.id;
  const a = await make(editor, 'Alpha'), b = await make(editor, 'Beta'), c = await make(contributor, 'Gamma');
  const bulk = (cookie, action, ids) => call(url, '/api/staff/content/bulk', {method: 'POST', cookie, body: {action, ids}});

  assert.equal((await bulk(undefined, 'publish', [a])).status, 401);
  assert.equal((await bulk(editor, 'explode', [a])).status, 400);
  assert.equal((await bulk(editor, 'publish', [])).status, 400);
  assert.equal((await bulk(editor, 'publish', Array.from({length: 51}, (_, i) => i + 1))).status, 400);
  assert.equal((await bulk(editor, 'publish', ['1; DROP TABLE users'])).status, 400);

  const published = await bulk(editor, 'publish', [a, b, 99999]);
  assert.equal(published.status, 200);
  assert.deepEqual(published.data.results.map(r => r.ok), [true, true, false], 'a missing item fails alone');
  assert.equal((await call(url, '/api/public/content/news/alpha')).status, 200);

  const denied = await bulk(contributor, 'publish', [c]);
  assert.equal(denied.data.results[0].ok, false, 'contributors cannot publish, in bulk either');
  assert.equal((await call(url, '/api/public/content/news/gamma')).status, 404);

  const editorDelete = await bulk(editor, 'delete', [a]);
  assert.equal(editorDelete.data.results[0].ok, false, 'editors cannot delete, in bulk either');
  const unpublished = await bulk(editor, 'unpublish', [a]);
  assert.equal(unpublished.data.results[0].ok, true);
  assert.equal((await call(url, '/api/public/content/news/alpha')).status, 404);
  assert.equal((await bulk(editor, 'archive', [b])).data.results[0].ok, true);
  const removed = await bulk(admin, 'delete', [a, b, c]);
  assert.deepEqual(removed.data.results.map(r => r.ok), [true, true, true]);
  const [[left]] = await pool.query('SELECT COUNT(*) AS n FROM content_items WHERE deleted_at IS NULL');
  assert.equal(Number(left.n), 0);
  const [logs] = await pool.query("SELECT metadata FROM activity_logs WHERE action = 'content.bulk'");
  assert.ok(logs.length >= 5, 'each bulk request is audited');
});
