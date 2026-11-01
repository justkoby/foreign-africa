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
  await root.query(`GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES ON \`${database.dbName}\`.* TO 'fa_cms'@'%'`);
  const config = {dbHost: '127.0.0.1', dbPort: database.port, dbUser: 'fa_cms', dbPassword: 'a-long-test-password', dbName: database.dbName, sessionSecret: 'test-secret', appEnv: 'test', passwordCost: 4, publicSiteUrl: 'http://127.0.0.1:9', mediaRoot: '', cookieSecure: false, stagingUser: '', stagingPassword: ''};
  const env = {PREPARE_DATABASE: '1', BOOTSTRAP_ADMIN_EMAIL: 'ada@foreignafrica.org', BOOTSTRAP_ADMIN_PASSWORD: 'correct-horse-battery'};
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
