import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {createHash} from 'node:crypto';
import mysql from 'mysql2/promise';
import {createDisposableMysql} from './helpers/mysql.js';
import {analyseGrants, maskName} from '../server/db-inspect.js';

const CMS_DB = 'u777654758_cms_staging';
const WP_DB = 'u777654758_wp_live';
const USER = 'u777654758_cms_user';
const PASSWORD = 'cms-user-secret-PASSWORD-789';
const ADMIN_PASSWORD = 'first-admin-password-123';
const freePort = () => new Promise((resolve, reject) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const {port} = s.address(); s.close(() => resolve(port)); }); s.on('error', reject); });

test('grants are read per database, and global privileges are noticed', () => {
  const all = analyseGrants([`GRANT USAGE ON *.* TO \`u1\`@\`%\` IDENTIFIED BY PASSWORD '*X'`, 'GRANT ALL PRIVILEGES ON `u777654758\\_cms\\_staging`.* TO `u1`@`%`'], CMS_DB);
  assert.deepEqual([all.create, all.alter, all.allPrivilegesHere, all.globalPrivileges], [true, true, true, false]);
  const dataOnly = analyseGrants(['GRANT SELECT, INSERT, UPDATE, DELETE ON `cms`.* TO `u1`@`%`'], 'cms');
  assert.deepEqual([dataOnly.create, dataOnly.alter, dataOnly.select], [false, false, true]);
  assert.equal(analyseGrants(['GRANT SELECT ON `other`.* TO `u1`@`%`'], 'cms').anyGrantHere, false);
  assert.equal(analyseGrants(['GRANT ALL PRIVILEGES ON *.* TO `u1`@`%`'], 'cms').globalPrivileges, true);
  assert.equal(maskName(CMS_DB), 'u777…staging');
});

test('the staging initialisation procedure, end to end on a replica of the Hostinger layout', {timeout: 280000}, async t => {
  let database;
  try { database = await createDisposableMysql(); } catch (error) { return t.skip(`Database could not be started: ${error.message}`); }
  const root = await mysql.createConnection({host: '127.0.0.1', port: database.port, user: 'root', multipleStatements: true});
  t.after(async () => { await root.end(); await database.stop(); });
  await root.query(`CREATE DATABASE \`${CMS_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await root.query(`CREATE DATABASE \`${WP_DB}\` CHARACTER SET utf8mb4; CREATE TABLE \`${WP_DB}\`.wp_posts (ID BIGINT PRIMARY KEY, post_title TEXT); CREATE TABLE \`${WP_DB}\`.wp_options (option_id BIGINT PRIMARY KEY, option_value TEXT); INSERT INTO \`${WP_DB}\`.wp_posts VALUES (1, 'Hello world'), (2, 'About us'); INSERT INTO \`${WP_DB}\`.wp_options VALUES (1, 'siteurl')`);
  // Exactly how hPanel creates it: one user, ALL PRIVILEGES on its own database only.
  await root.query(`CREATE USER '${USER}'@'%' IDENTIFIED BY '${PASSWORD}'`);
  await root.query(`GRANT ALL PRIVILEGES ON \`${CMS_DB}\`.* TO '${USER}'@'%'`);

  const fingerprint = async name => {
    const [tables] = await root.query('SELECT TABLE_NAME AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY 1', [name]);
    const rows = [];
    for (const {n} of tables) rows.push(JSON.stringify((await root.query(`SELECT * FROM \`${name}\`.\`${n}\``))[0]));
    return {tables: tables.map(row => row.n), digest: createHash('sha256').update(rows.join('|')).digest('hex')};
  };
  const wpBefore = await fingerprint(WP_DB);
  assert.deepEqual(wpBefore.tables, ['wp_options', 'wp_posts']);

  const baseEnv = {PATH: process.env.PATH, HOME: process.env.HOME, APP_ENV: 'staging', PUBLIC_SITE_URL: 'https://maroon-gazelle-601956.hostingersite.com', SESSION_SECRET: 's'.repeat(40), STAGING_USER: 'preview', STAGING_PASSWORD: 'a-long-staging-password', DB_HOST: '127.0.0.1', DB_PORT: String(database.port), DB_USER: USER, DB_PASSWORD: PASSWORD, DB_NAME: CMS_DB, PASSWORD_COST: '4'};
  // Starts the real server and waits until it reports something final (ready, a check report, or a failure).
  async function boot(extra) {
    const port = await freePort();
    const child = spawn('node', ['server/index.js'], {env: {...baseEnv, PORT: String(port), ...extra}, stdio: ['ignore', 'pipe', 'pipe']});
    let log = ''; child.stdout.on('data', d => { log += d; }); child.stderr.on('data', d => { log += d; });
    for (let i = 0; i < 120 && !/ready\.|Database check finished|\[fail\]/.test(log); i += 1) await new Promise(resolve => setTimeout(resolve, 250));
    const get = async path => { try { const r = await fetch(`http://127.0.0.1:${port}${path}`, {headers: {'X-Forwarded-Proto': 'https', Origin: baseEnv.PUBLIC_SITE_URL}}); return {status: r.status, text: await r.text(), headers: r.headers}; } catch (e) { return {status: 0, text: String(e.message)}; } };
    return {child, log: () => log, get, stop: () => child.kill('SIGKILL'), port};
  }
  const noSecrets = (...texts) => { for (const text of texts) for (const secret of [PASSWORD, ADMIN_PASSWORD, USER, 's'.repeat(40)]) assert.ok(!text.includes(secret), `output must not contain ${secret.slice(0, 6)}…`); };
  const cmsTables = async () => (await fingerprint(CMS_DB)).tables;

  await t.test('1. a read-only check first: reports everything and changes nothing', async () => {
    const app = await boot({PREPARE_DATABASE: 'check'});
    t.after(() => app.stop());
    const page = await app.get('/');
    assert.equal(page.status, 200);
    for (const expected of [/Connected using the main account/, /MariaDB 11\.8/, /u777…staging/, /database is empty\. This is the correct starting point/, /0 applied, 7 would be applied/, /ALL PRIVILEGES on this database/, /cannot see any other database/, /Safe to initialise: Yes/]) assert.match(page.text, expected);
    assert.deepEqual(await cmsTables(), [], 'the check created nothing');
    noSecrets(page.text, app.log());
    app.stop();
  });

  await t.test('2. initialisation is refused when the typed confirmation names a different database', async () => {
    for (const confirm of ['u777654758_wp_live', 'wrong']) {
      const app = await boot({PREPARE_DATABASE: '1', BOOTSTRAP_ADMIN_EMAIL: 'ada@foreignafrica.org', BOOTSTRAP_ADMIN_PASSWORD: ADMIN_PASSWORD, PREPARE_DATABASE_CONFIRM: confirm});
      const page = await app.get('/');
      assert.equal(page.status, 503);
      assert.match(page.text, /PREPARE_DATABASE_CONFIRM/);
      assert.ok(!page.text.includes('wp_live'), 'does not echo the typed value');
      app.stop();
    }
    assert.deepEqual(await cmsTables(), [], 'nothing was created');
  });

  await t.test('3. a half-set administrator is refused before anything is written', async () => {
    const app = await boot({PREPARE_DATABASE: '1', PREPARE_DATABASE_CONFIRM: CMS_DB, BOOTSTRAP_ADMIN_EMAIL: 'ada@foreignafrica.org'});
    assert.match((await app.get('/')).text, /Set both BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD, or neither/);
    app.stop();
    assert.deepEqual(await cmsTables(), []);
  });

  await t.test('4. a weak administrator password or bad e-mail is refused with its reason, before anything is written', async () => {
    for (const [email, password, expected] of [['ada@foreignafrica.org', 'short', /at least 12 characters/], ['not-an-email', ADMIN_PASSWORD, /valid e-mail/]]) {
      const app = await boot({PREPARE_DATABASE: '1', PREPARE_DATABASE_CONFIRM: CMS_DB, BOOTSTRAP_ADMIN_EMAIL: email, BOOTSTRAP_ADMIN_PASSWORD: password});
      const page = await app.get('/');
      assert.equal(page.status, 503);
      assert.match(page.text, expected);
      assert.match(page.text, /Nothing was changed/);
      noSecrets(page.text);
      app.stop();
    }
    assert.deepEqual(await cmsTables(), [], 'the database is still empty');
  });

  let ready;
  await t.test('5. the real initialisation: migrations 001 to 007, the administrator, the starting content', async () => {
    ready = await boot({PREPARE_DATABASE: '1', PREPARE_DATABASE_CONFIRM: CMS_DB, BOOTSTRAP_ADMIN_EMAIL: 'ada@foreignafrica.org', BOOTSTRAP_ADMIN_PASSWORD: ADMIN_PASSWORD, BOOTSTRAP_ADMIN_NAME: 'Ada Admin'});
    t.after(() => ready.stop());
    const log = ready.log();
    assert.match(log, /Applied 001_identity.*008_events_cms/);
    assert.match(log, /Super administrator created for ada@foreignafrica\.org/);
    assert.match(log, /Seed finished\. Inserted 17/);
    assert.match(log, /Foreign Africa is ready/);
    assert.match(log, /\[warn\] First administrator: BOOTSTRAP_ADMIN_PASSWORD is still set/);
    noSecrets(log);
    const [applied] = await root.query(`SELECT id FROM \`${CMS_DB}\`.schema_migrations ORDER BY id`);
    assert.deepEqual(applied.map(row => row.id), ['001_identity', '002_content', '003_listings', '004_editorial', '005_submissions', '006_media_metadata', '007_site_content', '008_events_cms']);
    const health = JSON.parse((await ready.get('/api/health')).text);
    assert.deepEqual(health, {ok: true, phase: 'running', database: 'ok'});
  });

  await t.test('6. authentication and dashboard work on the initialised database', async () => {
    const origin = baseEnv.PUBLIC_SITE_URL;
    const basic = `Basic ${Buffer.from('preview:a-long-staging-password').toString('base64')}`;
    const call = async (path, options = {}) => { const r = await fetch(`http://127.0.0.1:${ready.port}${path}`, {...options, headers: {'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https', Origin: origin, Authorization: basic, ...(options.headers ?? {})}}); return {status: r.status, data: await r.json().catch(() => ({})), headers: r.headers}; };
    assert.equal((await call('/api/staff/login', {method: 'POST', body: JSON.stringify({email: 'ada@foreignafrica.org', password: 'wrong-password-123'})})).status, 401);
    // No default credentials exist: the old documented fallback account must not be able to sign in.
    assert.equal((await call('/api/staff/login', {method: 'POST', body: JSON.stringify({email: 'info@foreignafrica.org', password: 'ChangeMeAdmin2026!'})})).status, 401);
    const login = await call('/api/staff/login', {method: 'POST', body: JSON.stringify({email: 'ada@foreignafrica.org', password: ADMIN_PASSWORD})});
    assert.equal(login.status, 200);
    assert.equal(login.data.user.role, 'super_admin');
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const dash = await call('/api/staff/dashboard', {headers: {Cookie: cookie}});
    assert.equal(dash.status, 200);
    assert.ok(dash.data.content.published >= 12, `starting content is visible: ${JSON.stringify(dash.data.content)}`);
    const settings = await call('/api/staff/settings', {headers: {Cookie: cookie}});
    assert.ok(settings.data.checks.every(check => check.status !== 'fail'));
  });

  await t.test('7. restarting with initialisation still on is safe and idempotent', async () => {
    ready.stop();
    const again = await boot({PREPARE_DATABASE: '1', PREPARE_DATABASE_CONFIRM: CMS_DB, BOOTSTRAP_ADMIN_EMAIL: 'ada@foreignafrica.org', BOOTSTRAP_ADMIN_PASSWORD: ADMIN_PASSWORD});
    t.after(() => again.stop());
    assert.match(again.log(), /Migrations are already up to date/);
    assert.doesNotMatch(again.log(), /password synchronized/, 'an unchanged password is left alone');
    assert.match(again.log(), /Seed finished\. Inserted 0, already present 17/);
    const [[users]] = await root.query(`SELECT COUNT(*) AS n FROM \`${CMS_DB}\`.users`);
    assert.equal(Number(users.n), 1);
    again.stop();
    // A changed BOOTSTRAP_ADMIN_PASSWORD is synchronised; with no bootstrap variables nothing is invented.
    const rotated = await boot({PREPARE_DATABASE: '1', PREPARE_DATABASE_CONFIRM: CMS_DB, BOOTSTRAP_ADMIN_EMAIL: 'ada@foreignafrica.org', BOOTSTRAP_ADMIN_PASSWORD: `${ADMIN_PASSWORD}-rotated`});
    assert.match(rotated.log(), /Administrator password synchronized for ada@foreignafrica\.org/);
    noSecrets(rotated.log());
    rotated.stop();
    const bare = await boot({PREPARE_DATABASE: '1', PREPARE_DATABASE_CONFIRM: CMS_DB});
    assert.doesNotMatch(bare.log(), /synchronized|created for/);
    bare.stop();
    const [[after]] = await root.query(`SELECT COUNT(*) AS n FROM \`${CMS_DB}\`.users`);
    assert.equal(Number(after.n), 1, 'still one account, no default admin added');
    const check = await boot({PREPARE_DATABASE: 'check'});
    assert.match((await check.get('/')).text, /This is already a Foreign Africa CMS database/);
    assert.match((await check.get('/')).text, /A super administrator exists/);
    check.stop();
  });

  await t.test('8. pointing the same account at the WordPress database is impossible, explained, and harmless', async () => {
    const app = await boot({PREPARE_DATABASE: '1', PREPARE_DATABASE_CONFIRM: WP_DB, DB_NAME: WP_DB, BOOTSTRAP_ADMIN_EMAIL: 'ada@foreignafrica.org', BOOTSTRAP_ADMIN_PASSWORD: ADMIN_PASSWORD});
    const page = await app.get('/');
    assert.equal(page.status, 503);
    assert.match(page.text, /not allowed to use it|DB_NAME/);
    noSecrets(page.text);
    app.stop();
    // and even a powerful account that CAN open the WordPress database is stopped by the content guard
    await root.query(`GRANT ALL PRIVILEGES ON \`${WP_DB}\`.* TO '${USER}'@'%'`);
    const guarded = await boot({PREPARE_DATABASE: '1', PREPARE_DATABASE_CONFIRM: WP_DB, DB_NAME: WP_DB, BOOTSTRAP_ADMIN_EMAIL: 'ada@foreignafrica.org', BOOTSTRAP_ADMIN_PASSWORD: ADMIN_PASSWORD});
    assert.match((await guarded.get('/')).text, /contains WordPress tables/);
    guarded.stop();
    const check = await boot({PREPARE_DATABASE: 'check', DB_NAME: WP_DB});
    const report = (await check.get('/')).text;
    assert.match(report, /holds WordPress tables/);
    assert.match(report, /Safe to initialise: No/);
    assert.match(report, /can also see 1 other database/, 'a broad account is flagged');
    check.stop();
  });

  await t.test('9. throughout, the WordPress database was never changed', async () => {
    const after = await fingerprint(WP_DB);
    assert.deepEqual(after, wpBefore, 'same tables, same rows');
  });
});
