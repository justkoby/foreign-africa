import test from 'node:test';
import assert from 'node:assert/strict';
import {createDisposableMysql} from './helpers/mysql.js';
import {createPool} from '../server/db.js';
import {prepareDatabase} from '../server/prepare.js';
import {createApp} from '../server/app.js';

// Mirrors a hosting control-panel database user: password login, one database, no administrative rights,
// and a small connection cap. Run it against every engine the site may be hosted on.
test('startup works for a least-privilege, connection-capped database user', {timeout: 300000}, async t => {
  let database;
  try { database = await createDisposableMysql(); } catch (error) { return t.skip(`Database could not be started: ${error.message}`); }
  const root = createPool({dbHost: '127.0.0.1', dbPort: database.port, dbUser: 'root', dbPassword: '', dbName: database.dbName});
  t.after(async () => { await root.end(); await database.stop(); });
  await root.query("CREATE USER 'fa_cms'@'%' IDENTIFIED BY 'a-long-test-password' WITH MAX_USER_CONNECTIONS 5");
  await root.query(`GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, REFERENCES ON \`${database.dbName}\`.* TO 'fa_cms'@'%'`);
  const config = {dbHost: '127.0.0.1', dbPort: database.port, dbUser: 'fa_cms', dbPassword: 'a-long-test-password', dbName: database.dbName, sessionSecret: 'test-secret', appEnv: 'test', passwordCost: 4, publicSiteUrl: 'http://127.0.0.1:9', mediaRoot: '', cookieSecure: false, stagingUser: '', stagingPassword: ''};
  const env = {PREPARE_DATABASE: '1', PREPARE_DATABASE_CONFIRM: database.dbName, BOOTSTRAP_ADMIN_EMAIL: 'ada@foreignafrica.org', BOOTSTRAP_ADMIN_PASSWORD: 'correct-horse-battery'};
  const first = await prepareDatabase(config, env);
  assert.equal(first.seeded, true);
  assert.equal(first.report.blocked.length, 0);
  const second = await prepareDatabase(config, env);
  assert.equal(second.report.inserted.length, 0, 'a second start inserts nothing');

  const pool = createPool(config);
  t.after(() => pool.end());
  const app = createApp({config, pool});
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${url}/api/staff/login`, {method: 'POST', headers: {'Content-Type': 'application/json', Origin: 'http://127.0.0.1:9'}, body: JSON.stringify({email: 'ada@foreignafrica.org', password: 'correct-horse-battery'})});
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  // More concurrent requests than the connection cap: they must queue in the pool, not fail.
  const results = await Promise.all(Array.from({length: 30}, () => fetch(`${url}/api/staff/content?type=news`, {headers: {Cookie: cookie}})));
  assert.deepEqual([...new Set(results.map(r => r.status))], [200]);
  const [[version]] = await root.query('SELECT VERSION() AS v');
  console.log(`# least-privilege run on ${version.v}`);
});

test('the running site works with data-only privileges when a separate account runs the migrations', {timeout: 300000}, async t => {
  let database;
  try { database = await createDisposableMysql(); } catch (error) { return t.skip(`Database could not be started: ${error.message}`); }
  const root = createPool({dbHost: '127.0.0.1', dbPort: database.port, dbUser: 'root', dbPassword: '', dbName: database.dbName});
  t.after(async () => { await root.end(); await database.stop(); });
  const db = `\`${database.dbName}\``;
  await root.query("CREATE USER 'fa_migrate'@'%' IDENTIFIED BY 'migrate-test-password'");
  await root.query(`GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, REFERENCES ON ${db}.* TO 'fa_migrate'@'%'`);
  await root.query("CREATE USER 'fa_runtime'@'%' IDENTIFIED BY 'runtime-test-password'");
  await root.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${db}.* TO 'fa_runtime'@'%'`);
  const config = {dbHost: '127.0.0.1', dbPort: database.port, dbUser: 'fa_runtime', dbPassword: 'runtime-test-password', dbMigrateUser: 'fa_migrate', dbMigratePassword: 'migrate-test-password', dbName: database.dbName, dbConnectionLimit: 3, sessionSecret: 'test-secret', appEnv: 'test', passwordCost: 4, publicSiteUrl: 'http://127.0.0.1:9', mediaRoot: '', cookieSecure: false, stagingUser: '', stagingPassword: '', cronSecret: 'c'.repeat(40)};
  const env = {PREPARE_DATABASE: '1', PREPARE_DATABASE_CONFIRM: database.dbName, BOOTSTRAP_ADMIN_EMAIL: 'ada@foreignafrica.org', BOOTSTRAP_ADMIN_PASSWORD: 'correct-horse-battery'};
  assert.equal((await prepareDatabase(config, env)).seeded, true, 'migrations, bootstrap and seed ran through the migration account');

  // The runtime account genuinely cannot change the schema.
  const runtime = createPool(config);
  t.after(() => runtime.end());
  await assert.rejects(() => runtime.query('CREATE TABLE should_not_exist (id INT)'), /denied|command/i);
  await assert.rejects(() => runtime.query('DROP TABLE settings'), /denied|command/i);

  let now = Date.parse('2026-10-25T12:00:00Z');
  const clock = () => now;
  const forms = [{id: 'general_enquiry', title: 'Enquiry', status: 'publish', success: 'Thanks.', fields: [{id: 'email', label: 'Email', type: 'email', required: true}]}];
  const server = await new Promise(resolve => { const s = createApp({config, pool: runtime, clock, forms: () => forms}).listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}`;
  const send = async (path, {body, cookie, headers = {}} = {}) => { const r = await fetch(`${url}${path}`, {method: body === undefined ? 'GET' : 'POST', headers: {'Content-Type': 'application/json', Origin: 'http://127.0.0.1:9', ...(cookie ? {Cookie: cookie} : {}), ...headers}, body: body === undefined ? undefined : JSON.stringify(body)}); return {status: r.status, data: await r.json().catch(() => ({})), headers: r.headers}; };
  const login = await send('/api/staff/login', {body: {email: 'ada@foreignafrica.org', password: 'correct-horse-battery'}});
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const made = await send('/api/staff/content', {cookie, body: {type: 'news', title: 'Runtime check', summary: 's', body: 'b'}});
  assert.equal(made.status, 201);
  assert.equal((await send(`/api/staff/content/${made.data.item.id}/state`, {cookie, body: {status: 'scheduled', publishedAt: new Date(now + 3600_000).toISOString()}})).status, 200);
  now += 2 * 3600_000;
  assert.equal((await send('/api/cron/publish', {body: {}, headers: {Authorization: `Bearer ${config.cronSecret}`}})).data.promoted, 1, 'locking reads and transactions need no extra privilege');
  assert.equal((await send('/api/cms/submit', {body: {formId: 'general_enquiry', answers: {email: 'a@b.co'}}})).status, 200);
  assert.equal((await send('/api/staff/submissions', {cookie})).data.total, 1);
});
