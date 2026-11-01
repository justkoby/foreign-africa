import test from 'node:test';
import assert from 'node:assert/strict';
import {createDisposableMysql} from './helpers/mysql.js';
import {createPool} from '../server/db.js';
import {migrate, migrationsDirectory} from '../server/migrate.js';
import {createApp} from '../server/app.js';
import {provisionAdmin, createUser} from '../server/store.js';

const password = 'correct-horse-battery';
const origin = 'http://127.0.0.1:9';

test('dashboard overview and listing counts use real data and respect permissions', {timeout: 300000}, async t => {
  let database;
  try { database = await createDisposableMysql(); } catch (error) { return t.skip(`Database could not be started: ${error.message}`); }
  const pool = createPool({dbHost: '127.0.0.1', dbPort: database.port, dbUser: database.username, dbPassword: '', dbName: database.dbName});
  const config = {appEnv: 'test', publicSiteUrl: origin, sessionSecret: 'test-secret', cookieSecure: false, passwordCost: 4, mediaRoot: '', stagingUser: '', stagingPassword: '', legacyFileEditing: false};
  const clock = () => Date.parse('2026-10-25T12:00:00Z');
  await migrate({pool, directory: migrationsDirectory});
  await provisionAdmin({pool, config, clock, email: 'ada@foreignafrica.org', name: 'Ada Admin', password});
  const server = await new Promise(resolve => { const s = createApp({config, pool, clock}).listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(async () => { server.close(); await pool.end(); await database.stop(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  async function call(path, {method = 'GET', body, cookie} = {}) {
    const response = await fetch(`${url}${path}`, {method, headers: {'Content-Type': 'application/json', Origin: origin, ...(cookie ? {Cookie: cookie} : {})}, body: body === undefined ? undefined : JSON.stringify(body)});
    const set = (response.headers.get('set-cookie') || '').split(';')[0];
    return {status: response.status, data: await response.json().catch(() => ({})), headers: response.headers, cookie: set.startsWith('fa_staff=') ? set : cookie};
  }
  const login = async email => (await call('/api/staff/login', {method: 'POST', body: {email, password}})).cookie;
  const admin = await login('ada@foreignafrica.org');
  const adminUser = (await call('/api/staff/session', {cookie: admin})).data.user;
  await createUser({pool, config, clock, actor: adminUser, input: {name: 'Cori Contributor', email: 'cori@foreignafrica.org', role: 'contributor', password}});
  const cori = await login('cori@foreignafrica.org');

  const make = async (title, status) => {
    const created = await call('/api/staff/content', {method: 'POST', cookie: admin, body: {type: 'news', title, summary: 'x', document: {type: 'doc', content: [{type: 'paragraph', content: [{type: 'text', text: title}]}]}}});
    assert.equal(created.status, 201, JSON.stringify(created.data));
    if (status !== 'draft') assert.equal((await call(`/api/staff/content/${created.data.item.id}/state`, {method: 'POST', cookie: admin, body: {status}})).status, 200);
    return created.data.item;
  };

  await t.test('an empty site reports zeros and nothing invented', async () => {
    const result = await call('/api/staff/overview', {cookie: admin});
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.equal(result.data.counts.published, 0);
    assert.deepEqual(result.data.recent, []);
    assert.deepEqual(result.data.attention, []);
  });

  await make('First published', 'published');
  await make('Second published', 'published');
  await make('A draft', 'draft');
  await make('Archived one', 'archived');

  await t.test('counts, recent items and listing tab counts match the database', async () => {
    const result = await call('/api/staff/overview', {cookie: admin});
    assert.equal(result.data.counts.published, 2);
    assert.equal(result.data.counts.draft, 1);
    assert.equal(result.data.recent.length, 2);
    assert.ok(result.data.recent.every(item => item.status === 'published'));
    const list = await call('/api/staff/content?type=news', {cookie: admin});
    assert.equal(list.status, 200);
    assert.deepEqual(list.data.counts, {published: 2, draft: 1, archived: 1});
  });

  await t.test('the overview is private and never lists admin-only warnings to contributors', async () => {
    assert.equal((await call('/api/staff/overview')).status, 401);
    const mine = await call('/api/staff/overview', {cookie: cori});
    assert.equal(mine.status, 200);
    assert.deepEqual(mine.data.warnings, []);
    assert.equal(mine.data.submissions, null);
    assert.equal(JSON.stringify(mine.data).includes('sessionSecret'), false);
  });
});
