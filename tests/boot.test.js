import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {existsSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBoot, describeStartupError, listenTarget} from '../server/boot.js';

const SECRET = 'TOP-SECRET-VALUE-0123456789-abcdefghijklmnop';
const DB_PASSWORD = 'db-password-that-must-never-appear';
const freePort = () => new Promise((resolve, reject) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const {port} = s.address(); s.close(() => resolve(port)); }); s.on('error', reject); });

// Starts the real server as a child process, exactly as a host's `node server/index.js` would.
async function run(env, {wait = 2500, port} = {}) {
  const portValue = port ?? String(await freePort());
  const child = spawn('node', ['server/index.js'], {env: {PATH: process.env.PATH, HOME: process.env.HOME, PORT: portValue, ...env}, stdio: ['ignore', 'pipe', 'pipe']});
  let log = '';
  child.stdout.on('data', d => { log += d; }); child.stderr.on('data', d => { log += d; });
  let exited = null;
  child.on('exit', code => { exited = code; });
  await new Promise(resolve => setTimeout(resolve, wait));
  const fetchText = async path => {
    try {
      const options = /^\d+$/.test(portValue) ? {} : {};
      const response = await fetch(`http://127.0.0.1:${portValue}${path}`, options);
      return {status: response.status, text: await response.text(), headers: response.headers};
    } catch (error) { return {status: 0, text: String(error.cause?.code || error.message), headers: new Headers()}; }
  };
  return {child, log: () => log, exited: () => exited, fetch: fetchText, stop: () => child.kill('SIGKILL')};
}

const stagingBase = {APP_ENV: 'staging', PUBLIC_SITE_URL: 'https://fa-staging-123.hostingersite.com', SESSION_SECRET: SECRET, STAGING_USER: 'preview', STAGING_PASSWORD: 'a-long-staging-password', DB_PASSWORD};

test('PORT may be a number, empty, or a socket path', () => {
  assert.equal(listenTarget('8080'), 8080);
  assert.equal(listenTarget(undefined), 3000);
  assert.equal(listenTarget(''), 3000);
  assert.equal(listenTarget('/tmp/app.sock'), '/tmp/app.sock');
  assert.equal(listenTarget('\\\\.\\pipe\\app'), '\\\\.\\pipe\\app');
});

test('database errors are explained by code and never by the driver message', () => {
  for (const [code, words] of [['ECONNREFUSED', /DB_HOST/], ['ER_ACCESS_DENIED_ERROR', /DB_USER/], ['ER_BAD_DB_ERROR', /DB_NAME/], ['ER_DBACCESS_DENIED_ERROR', /DB_NAME.*assign the user/], ['ER_TABLEACCESS_DENIED_ERROR', /CREATE and ALTER/]]) {
    const {detail} = describeStartupError(Object.assign(new Error("Access denied for user 'secretuser'@'10.0.0.5' (using password: YES)"), {code}));
    assert.match(detail, words, code);
    assert.ok(!/secretuser|10\.0\.0\.5|password: YES/.test(detail), 'the driver message is not repeated');
  }
  assert.match(describeStartupError(Object.assign(new Error('boom'), {migration: '004_editorial', cause: {code: 'ER_PARSE_ERROR'}})).detail, /004_editorial/);
  assert.match(describeStartupError(Object.assign(new Error('Refusing to migrate: this database contains WordPress tables.'), {status: 409})).detail, /WordPress/);
});

test('the boot handler reports state without leaking anything', async () => {
  const boot = createBoot();
  const reply = path => new Promise(resolve => { const headers = {}; let body = ''; boot.handler({url: path}, {statusCode: 0, setHeader: (k, v) => { headers[k.toLowerCase()] = v; }, end: text => resolve({status: 0, headers, body: text, code: undefined}), get statusCode() { return 0; }, set statusCode(v) { headers.__status = v; }}); });
  const starting = await reply('/');
  assert.equal(starting.headers.__status, 503);
  assert.match(starting.body, /starting/);
  boot.state.phase = 'configuration'; boot.state.problems = [{label: 'Session secret', detail: 'SESSION_SECRET must be at least 32 random characters.'}];
  assert.match((await reply('/anything')).body, /SESSION_SECRET must be at least 32/);
  const health = JSON.parse((await reply('/api/health')).body);
  assert.deepEqual([health.ok, health.phase, health.problems[0].label], [false, 'configuration', 'Session secret']);
});

test('a staging deployment with unsafe settings STAYS UP and explains itself (it no longer exits to a bare 503)', async t => {
  const app = await run({...stagingBase, PUBLIC_SITE_URL: 'https://foreignafrica.org', SESSION_SECRET: 'short', STAGING_USER: '', STAGING_PASSWORD: ''});
  t.after(() => app.stop());
  assert.equal(app.exited(), null, 'the process is still running');
  assert.match(app.log(), /listening on/);
  const page = await app.fetch('/');
  assert.equal(page.status, 503);
  assert.match(page.text, /could not start/);
  for (const expected of [/production address/, /SESSION_SECRET/, /STAGING_USER and STAGING_PASSWORD/]) assert.match(page.text, expected);
  assert.match(page.headers.get('x-robots-tag'), /noindex/);
  const health = JSON.parse((await app.fetch('/api/health')).text);
  assert.equal(health.ok, false);
  assert.equal(health.phase, 'configuration');
  assert.ok(!(page.text + app.log()).includes(SECRET), 'the secret never appears');
});

test('PREPARE_DATABASE with missing settings stays up and names the missing variables', async t => {
  const app = await run({...stagingBase, PREPARE_DATABASE: '1'});
  t.after(() => app.stop());
  assert.equal(app.exited(), null);
  const page = await app.fetch('/');
  assert.equal(page.status, 503);
  assert.match(page.text, /Database/);
});

test('an unreachable database is explained by cause, not with the useless "Database preparation failed."', async t => {
  const dead = await freePort();
  const app = await run({...stagingBase, PREPARE_DATABASE: '1', PREPARE_DATABASE_CONFIRM: 'cms_db', DB_HOST: '127.0.0.1', DB_PORT: String(dead), DB_USER: 'secretuser', DB_NAME: 'cms_db'}, {wait: 3500});
  t.after(() => app.stop());
  assert.equal(app.exited(), null, 'still running');
  const page = await app.fetch('/');
  assert.equal(page.status, 503);
  assert.match(page.text, /refused the connection/);
  assert.match(page.text, /ECONNREFUSED/);
  assert.ok(!/secretuser|cms_db/.test(page.text + app.log()), 'no user or database name in the output');
  assert.ok(!(page.text + app.log()).includes(DB_PASSWORD));
});

test('production does not serve a diagnostic page: it exits', async () => {
  const app = await run({...stagingBase, APP_ENV: 'production', SESSION_SECRET: 'short', STAGING_USER: '', STAGING_PASSWORD: ''}, {wait: 2500});
  assert.equal(app.exited(), 1);
  assert.match(app.log(), /\[fail\] Session secret/);
});

test('a correct setup listens immediately, becomes ready, and serves the site', async t => {
  const app = await run({APP_ENV: 'development'});
  t.after(() => app.stop());
  assert.match(app.log(), /listening on/);
  assert.match(app.log(), /ready/);
  assert.equal(app.exited(), null);
  const page = await app.fetch('/');
  assert.ok([200, 404].includes(page.status), `serves (200 with a build, 404 without): ${page.status}`);
  assert.notEqual(page.status, 503);
  const health = await app.fetch('/api/health');
  assert.equal(health.status, 503);
  assert.deepEqual(JSON.parse(health.text), {ok: false, phase: 'running', database: 'not_configured'});
});

test('PORT as a socket path works', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'fa-sock-'));
  const socket = join(dir, 'app.sock');
  const app = await run({APP_ENV: 'development'}, {port: socket});
  t.after(() => { app.stop(); rmSync(dir, {recursive: true, force: true}); });
  assert.match(app.log(), /listening on/);
  assert.equal(app.exited(), null);
  assert.ok(existsSync(socket), 'the socket exists');
});

test('health is reachable without the staging password and reveals no configuration', async t => {
  const app = await run({...stagingBase, DB_HOST: '', DB_USER: '', DB_NAME: ''});
  t.after(() => app.stop());
  // not hosted-ready without a database, so it reports the problem; either way it must not need credentials or leak
  const health = await app.fetch('/api/health');
  assert.equal(health.status, 503);
  assert.ok(!health.text.includes(SECRET) && !health.text.includes('hostingersite'));
});
