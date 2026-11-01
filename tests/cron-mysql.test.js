import test from 'node:test';
import assert from 'node:assert/strict';
import {createDisposableMysql} from './helpers/mysql.js';
import {createPool} from '../server/db.js';
import {migrate, migrationsDirectory} from '../server/migrate.js';
import {createApp} from '../server/app.js';
import {provisionAdmin, promoteScheduled} from '../server/store.js';
import {readConfig} from '../server/config.js';

const password = 'correct-horse-battery';
const secret = 'cron-secret-0123456789-abcdefghijklmnopqrstuvwxyz';

test('config: the cron secret must be long, and the pool size is bounded', () => {
  assert.equal(readConfig({CRON_SECRET: 'short'}).cronSecret, '');
  assert.equal(readConfig({CRON_SECRET: secret}).cronSecret, secret);
  assert.equal(readConfig({}).dbConnectionLimit, 5);
  assert.equal(readConfig({DB_CONNECTION_LIMIT: '3'}).dbConnectionLimit, 3);
  assert.equal(readConfig({DB_CONNECTION_LIMIT: '0'}).dbConnectionLimit, 5);
  assert.equal(readConfig({DB_CONNECTION_LIMIT: '9999'}).dbConnectionLimit, 25);
  assert.equal(readConfig({DB_CONNECTION_LIMIT: 'abc'}).dbConnectionLimit, 5);
});

async function http(url, path, {method = 'POST', headers = {}, body} = {}) {
  const response = await fetch(`${url}${path}`, {method, headers: {'Content-Type': 'application/json', ...headers}, body: body === undefined ? undefined : JSON.stringify(body)});
  const text = await response.text();
  let data = {}; try { data = JSON.parse(text); } catch { /* html */ }
  return {status: response.status, data, text, headers: response.headers};
}

test('cron publish endpoint (real database)', {timeout: 300000}, async t => {
  let database;
  try { database = await createDisposableMysql(); } catch (error) { return t.skip(`Database could not be started: ${error.message}`); }
  const pool = createPool({dbHost: '127.0.0.1', dbPort: database.port, dbUser: database.username, dbPassword: '', dbName: database.dbName, dbConnectionLimit: 8});
  let now = Date.parse('2026-10-25T12:00:00Z');
  const clock = () => now;
  const base = {appEnv: 'test', publicSiteUrl: 'http://127.0.0.1:9', sessionSecret: 'test-secret', cookieSecure: false, passwordCost: 4, mediaRoot: '', stagingUser: '', stagingPassword: '', legacyFileEditing: false, cronSecret: secret};
  await migrate({pool, directory: migrationsDirectory});
  await provisionAdmin({pool, config: base, clock, email: 'ada@foreignafrica.org', name: 'Ada', password});
  const listen = app => new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const main = await listen(createApp({config: base, pool, clock}));
  const disabled = await listen(createApp({config: {...base, cronSecret: ''}, pool, clock}));
  const production = await listen(createApp({config: {...base, appEnv: 'production'}, pool, clock}));
  t.after(async () => { main.close(); disabled.close(); production.close(); await pool.end(); await database.stop(); });
  const url = s => `http://127.0.0.1:${s.address().port}`;
  const auth = {Authorization: `Bearer ${secret}`};
  let addr = 10;
  const from = (headers = {}) => ({...headers, 'X-Forwarded-For': `198.51.100.${addr++}`});

  const login = await http(url(main), '/api/staff/login', {headers: {Origin: 'http://127.0.0.1:9'}, body: {email: 'ada@foreignafrica.org', password}});
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const staff = (path, body) => http(url(main), path, {headers: {Origin: 'http://127.0.0.1:9', Cookie: cookie}, body});
  const schedule = async title => {
    const made = await staff('/api/staff/content', {type: 'news', title, summary: 's', body: 'b'});
    const when = new Date(now + 3600_000).toISOString();
    assert.equal((await staff(`/api/staff/content/${made.data.item.id}/state`, {status: 'scheduled', publishedAt: when})).status, 200);
    return made.data.item.id;
  };

  await t.test('disabled unless a long secret is configured', async () => {
    assert.equal((await http(url(disabled), '/api/cron/publish', {headers: auth})).status, 404);
  });

  await t.test('only POST with the exact bearer token is accepted; the token is never read from the URL', async () => {
    assert.equal((await http(url(main), '/api/cron/publish', {method: 'GET', headers: from(auth)})).status, 405);
    assert.equal((await http(url(main), '/api/cron/publish', {headers: from()})).status, 401);
    assert.equal((await http(url(main), '/api/cron/publish', {headers: from({Authorization: 'Bearer wrong'})})).status, 401);
    assert.equal((await http(url(main), '/api/cron/publish', {headers: from({Authorization: `Bearer ${secret.slice(0, -1)}`})})).status, 401);
    assert.equal((await http(url(main), '/api/cron/publish', {headers: from({Authorization: `Bearer ${secret}x`})})).status, 401);
    assert.equal((await http(url(main), '/api/cron/publish', {headers: from({Authorization: `Basic ${secret}`})})).status, 401);
    assert.equal((await http(url(main), `/api/cron/publish?token=${secret}`, {headers: from()})).status, 401);
    assert.equal((await http(url(main), '/api/cron/publish', {headers: from({'X-Cron-Token': secret})})).status, 401);
    const bad = await http(url(main), '/api/cron/publish', {headers: from({Authorization: 'Bearer nope'})});
    assert.ok(!bad.text.includes(secret));
  });

  await t.test('failed attempts are rate limited per client', async () => {
    const results = [];
    for (let i = 0; i < 8; i += 1) results.push((await http(url(main), '/api/cron/publish', {headers: {Authorization: 'Bearer guess', 'X-Forwarded-For': '192.0.2.50'}})).status);
    assert.ok(results.includes(429), `expected a 429 after repeated failures: ${results}`);
    assert.equal((await http(url(main), '/api/cron/publish', {headers: from(auth)})).status, 200, 'a different client with a valid token is still served');
  });

  await t.test('production requires HTTPS (via the proxy header), development does not', async () => {
    assert.equal((await http(url(production), '/api/cron/publish', {headers: auth})).status, 400);
    const secure = await http(url(production), '/api/cron/publish', {headers: {...auth, 'X-Forwarded-For': '198.51.100.9', 'X-Forwarded-Proto': 'https'}});
    assert.equal(secure.status, 200);
  });

  await t.test('promotes each due item exactly once, even under concurrent and repeated requests', async () => {
    const ids = [await schedule('Cron one'), await schedule('Cron two'), await schedule('Cron three')];
    assert.equal((await http(url(main), '/api/cron/publish', {headers: {...auth, 'X-Forwarded-For': '203.0.113.1'}})).data.promoted, 0, 'nothing is due yet');
    now += 2 * 3600_000;
    const runs = await Promise.all(Array.from({length: 12}, (_, i) => i % 2 ? http(url(main), '/api/cron/publish', {headers: auth}) : promoteScheduled(pool, clock).then(promoted => ({status: 200, data: {promoted}}))));
    assert.ok(runs.every(r => r.status === 200));
    assert.equal(runs.reduce((sum, r) => sum + r.data.promoted, 0), 3, 'three items, promoted three times in total');
    const [logs] = await pool.query("SELECT subject_id FROM activity_logs WHERE action = 'content.published' AND subject_type = 'content' AND metadata LIKE '%schedule%'");
    assert.deepEqual(logs.map(l => Number(l.subject_id)).sort(), ids.sort(), 'each promotion is logged exactly once');
    assert.equal((await http(url(main), '/api/cron/publish', {headers: auth})).data.promoted, 0, 'a replay is a no-op');
    assert.equal((await http(url(main), '/api/public/content/news/cron-one', {method: 'GET'})).status, 200);
  });

  await t.test('the last run is recorded for the health screen', async () => {
    const health = await http(url(main), '/api/staff/health', {method: 'GET', headers: {Cookie: cookie}});
    assert.equal(health.data.cron.configured, true);
    assert.equal(health.data.cron.lastRun.promoted, 0);
  });

  await t.test('a failing run is logged without the secret and reports a generic error', async () => {
    const broken = {...pool, getConnection: async () => { const e = new Error(`connection refused for ${secret}`); e.code = 'ECONNREFUSED'; throw e; }, execute: (...args) => pool.execute(...args)};
    const server = await listen(createApp({config: base, pool: broken, clock}));
    const captured = [];
    const original = {error: console.error, warn: console.warn};
    console.error = (...a) => captured.push(a.join(' ')); console.warn = (...a) => captured.push(a.join(' '));
    try {
      const failed = await http(url(server), '/api/cron/publish', {headers: auth});
      assert.equal(failed.status, 500);
      assert.ok(!failed.text.includes(secret));
    } finally { console.error = original.error; console.warn = original.warn; server.close(); }
    assert.ok(captured.length >= 1);
    assert.ok(!captured.join('\n').includes(secret), 'logs must not contain the secret');
    const [rows] = await pool.query("SELECT metadata FROM activity_logs WHERE action = 'system.error' AND subject_type = 'cron'");
    assert.equal(rows.length, 1);
    assert.ok(!JSON.stringify(rows).includes(secret));
  });
});
