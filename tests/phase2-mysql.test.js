import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, copyFileSync, mkdirSync, existsSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDB} from 'mysql-memory-server';
import {createPool} from '../server/db.js';
import {migrate, migrationsDirectory} from '../server/migrate.js';
import {createApp} from '../server/app.js';
import {provisionAdmin} from '../server/store.js';
import {seedCatalogue} from '../server/seed-content.js';
import {createSite} from '../server/site.js';
import {exportTables, importTables} from '../server/backup.js';
import {documentText} from '../server/document.js';

const password = 'correct-horse-battery';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

function listen(app) {
  return new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => resolve({server, url: `http://127.0.0.1:${server.address().port}`}));
  });
}

async function call(url, path, {method = 'GET', body, cookie, headers = {}, origin = 'http://127.0.0.1:9'} = {}) {
  const response = await fetch(`${url}${path}`, {method, headers: {Origin: origin, ...(body && !headers['Content-Type'] ? {'Content-Type': 'application/json'} : {}), ...headers, ...(cookie ? {Cookie: cookie} : {})}, body});
  const data = await response.json().catch(() => ({}));
  const setCookie = response.headers.get('set-cookie') || '';
  return {status: response.status, data, cookie: setCookie.startsWith('fa_staff=') ? setCookie.split(';')[0] : cookie, location: response.headers.get('location'), text: data && Object.keys(data).length ? '' : await response.text().catch(() => '')};
}

test('phase 2 content, media, seed, and restore', {timeout: 300000}, async (t) => {
  let database;
  let restored;
  try {
    database = await createDB({version: '8.4.x'});
    restored = await createDB({version: '8.4.x'});
  } catch (error) {
    return t.skip(`MySQL 8 could not be started: ${error.message}`);
  }
  const mediaRoot = mkdtempSync(join(tmpdir(), 'fa-media-'));
  const pool = createPool({dbHost: '127.0.0.1', dbPort: database.port, dbUser: database.username, dbPassword: '', dbName: database.dbName});
  const config = {appEnv: 'test', publicSiteUrl: 'http://127.0.0.1:9', sessionSecret: 'test-secret', cookieSecure: false, passwordCost: 4, mediaRoot, stagingUser: '', stagingPassword: ''};
  const clock = () => Date.parse('2026-10-25T12:00:00Z');
  t.after(async () => {await pool.end(); await database.stop(); await restored.stop();});
  await migrate({pool, directory: migrationsDirectory});
  await provisionAdmin({pool, config, clock, email: 'ada@foreignafrica.org', name: 'Ada Admin', password});
  const app = createApp({config, pool, clock});
  const {server, url} = await listen(app);
  const admin = await call(url, '/api/staff/login', {method: 'POST', body: JSON.stringify({email: 'ada@foreignafrica.org', password})});
  assert.equal(admin.status, 200);

  await t.test('documents, revisions, and publishing rules', async () => {
    const bad = await call(url, '/api/staff/content', {method: 'POST', cookie: admin.cookie, body: JSON.stringify({type: 'news', title: 'Bad format', document: {type: 'doc', content: [{type: 'script'}]}})});
    assert.equal(bad.status, 400);
    const created = await call(url, '/api/staff/content', {method: 'POST', cookie: admin.cookie, body: JSON.stringify({type: 'news', title: 'A real headline', summary: 'Summary', body: 'The article body'})});
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const id = created.data.item.id;
    const revised = await call(url, `/api/staff/content/${id}`, {method: 'PATCH', cookie: admin.cookie, body: JSON.stringify({title: 'A revised headline', document: {type: 'doc', content: [{type: 'paragraph', content: [{type: 'text', text: 'Visible sentence', marks: [{type: 'bold'}]}]}]}})});
    assert.equal(revised.status, 200);
    assert.match(revised.data.item.html, /<strong>Visible sentence<\/strong>/);
    const history = await call(url, `/api/staff/content/${id}/revisions`, {cookie: admin.cookie});
    assert.ok(history.data.revisions.length >= 2);
    const restoredItem = await call(url, `/api/staff/content/${id}/restore`, {method: 'POST', cookie: admin.cookie, body: JSON.stringify({revisionId: history.data.revisions.at(-1).id})});
    assert.equal(restoredItem.status, 200);
    assert.equal(restoredItem.data.item.status, 'draft');
    const contributor = await call(url, '/api/staff/users', {method: 'POST', cookie: admin.cookie, body: JSON.stringify({name: 'Cori Contributor', email: 'cori@foreignafrica.org', role: 'contributor', password})});
    const cori = await call(url, '/api/staff/login', {method: 'POST', body: JSON.stringify({email: 'cori@foreignafrica.org', password})});
    assert.equal(contributor.status, 201);
    const denied = await call(url, `/api/staff/content/${id}/state`, {method: 'POST', cookie: cori.cookie, body: JSON.stringify({status: 'published'})});
    assert.equal(denied.status, 403);
    assert.equal((await call(url, `/api/staff/content/${id}/state`, {method: 'POST', cookie: admin.cookie, body: JSON.stringify({status: 'published'})})).status, 200);
  });

  await t.test('uploads reject unsafe files and keep referenced files', async () => {
    const boundary = '----fa-test';
    const part = (filename, bytes, type) => Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`),
      bytes,
      Buffer.from('\r\n'),
    ]);
    const upload = async (filename, bytes, type, cookie = admin.cookie) => {
      const body = Buffer.concat([part(filename, bytes, type), Buffer.from(`--${boundary}--\r\n`)]);
      return call(url, '/api/staff/media', {method: 'POST', cookie, headers: {'Content-Type': `multipart/form-data; boundary=${boundary}`}, body});
    };
    assert.equal((await upload('note.txt', Buffer.from('hello'), 'text/plain')).status, 400);
    assert.equal((await upload('pic.png', png, 'image/png', '')).status, 401);
    const big = Buffer.concat([png, Buffer.alloc(8 * 1024 * 1024)]);
    assert.equal((await upload('big.png', big, 'image/png')).status, 413);
    const saved = await upload('../../etc/passwd.png', png, 'image/png');
    assert.equal(saved.status, 201, JSON.stringify(saved.data));
    assert.equal(saved.data.asset.url.startsWith('/media/'), true);
    const [stored] = await pool.execute('SELECT storage_path FROM media_assets WHERE id = ?', [saved.data.asset.id]);
    assert.equal(String(stored[0].storage_path).includes('..'), false);
    assert.equal(existsSync(join(mediaRoot, stored[0].storage_path)), true);
    const article = await call(url, '/api/staff/content', {method: 'POST', cookie: admin.cookie, body: JSON.stringify({type: 'news', title: 'With a picture', featuredMediaId: saved.data.asset.id, document: {type: 'doc', content: [{type: 'image', attrs: {src: saved.data.asset.url, alt: 'Cover'}}]}})});
    assert.equal(article.status, 201, JSON.stringify(article.data));
    assert.equal((await call(url, `/api/staff/media/${saved.data.asset.id}`, {method: 'DELETE', cookie: admin.cookie})).status, 409);
    const file = await fetch(`${url}${saved.data.asset.url}`);
    assert.equal(file.status, 200);
    assert.match(file.headers.get('content-type'), /image\/png/);
  });

  await t.test('the catalogue seed is complete, repeatable, and public', async () => {
    const [users] = await pool.execute('SELECT id FROM users WHERE email = ?', ['ada@foreignafrica.org']);
    const first = await seedCatalogue({pool, clock, actor: {id: users[0].id, roles: ['super_admin']}});
    assert.equal(first.blocked.length, 0);
    assert.equal(first.inserted.filter(item => item.type === 'commentary').length, 12);
    const second = await seedCatalogue({pool, clock, actor: {id: users[0].id, roles: ['super_admin']}});
    assert.equal(second.inserted.length, 0);
    const [rows] = await pool.execute("SELECT slug, author_name, body_html, published_at, external_url FROM content_items WHERE content_type = 'commentary' AND deleted_at IS NULL");
    assert.equal(rows.length, 12);
    assert.equal(new Set(rows.map(row => row.slug)).size, 12);
    const ghana = rows.find(row => row.slug.startsWith('ghanas-brics'));
    assert.match(ghana.author_name, /Elorm Mawuli-Kwawu/);
    assert.match(ghana.published_at instanceof Date ? ghana.published_at.toISOString() : String(ghana.published_at), /2026-10-12/);
    assert.match(ghana.body_html, /On 6 October 2026, Foreign Minister Samuel Okudzeto Ablakwa/);
    assert.ok(documentText({type: 'doc', content: [{type: 'paragraph', content: [{type: 'text', text: ghana.body_html}]}]}).length > 80);
    const [news] = await pool.execute("SELECT slug, body_html, external_url FROM content_items WHERE content_type = 'news' AND legacy_id <> ''");
    assert.equal(news.length, 5);
    assert.equal(news.filter(row => row.external_url && !row.body_html).length, 3);
    const list = await call(url, '/api/public/content?type=commentary&pageSize=20');
    assert.equal(list.data.total, 12);
    const page = await call(url, '/api/public/content?type=commentary&pageSize=1&page=2');
    assert.equal(page.data.items.length, 1);
    assert.equal((await call(url, '/api/public/content/commentary/missing-slug')).status, 404);
    const hidden = await call(url, '/api/staff/content', {method: 'POST', cookie: admin.cookie, body: JSON.stringify({type: 'commentary', title: 'Private note', body: 'Do not publish this sentence'})});
    assert.equal((await call(url, `/api/public/content/commentary/${hidden.data.item.slug}`)).status, 404);
    const html = await fetch(`${url}/api/public/content/commentary/${ghana.slug}?format=html`);
    const text = await html.text();
    assert.match(text, /On 6 October 2026/);
    assert.match(text, /canonical/);
    assert.match(text, /noindex/);
    const external = news.find(row => row.external_url);
    const redirect = await fetch(`${url}/api/public/content/news/${external.slug}?format=html`, {redirect: 'manual'});
    assert.equal(redirect.status, 302);
    assert.match(redirect.headers.get('location'), /^https:\/\/foreignafrica\.org\//);
    const production = createApp({config: {...config, appEnv: 'production', publicSiteUrl: 'https://foreignafrica.org'}, pool, clock});
    const live = await listen(production);
    try {
      const sitemap = await fetch(`${live.url}/sitemap.xml`);
      const xml = await sitemap.text();
      assert.match(xml, /ghana/);
      assert.doesNotMatch(xml, /private-note|Private note/);
    } finally {await new Promise(resolve => live.server.close(resolve));}
  });

  await t.test('a copied database and media file restore the article', async () => {
    const dump = await exportTables(pool);
    const [media] = await pool.execute("SELECT storage_path FROM media_assets WHERE storage_path NOT LIKE 'site:%' AND deleted_at IS NULL LIMIT 1");
    const backupDir = mkdtempSync(join(tmpdir(), 'fa-backup-'));
    mkdirSync(join(backupDir, 'files'), {recursive: true});
    copyFileSync(join(mediaRoot, media[0].storage_path), join(backupDir, media[0].storage_path));
    const other = createPool({dbHost: '127.0.0.1', dbPort: restored.port, dbUser: restored.username, dbPassword: '', dbName: restored.dbName});
    await migrate({pool: other, directory: migrationsDirectory});
    await importTables(other, dump);
    const otherRoot = mkdtempSync(join(tmpdir(), 'fa-restored-media-'));
    mkdirSync(join(otherRoot, 'files'), {recursive: true});
    copyFileSync(join(backupDir, media[0].storage_path), join(otherRoot, media[0].storage_path));
    const [article] = await other.execute("SELECT title, status FROM content_items WHERE content_type = 'commentary' AND slug LIKE 'ghanas-brics%'");
    const [role] = await other.execute("SELECT roles.role_key FROM users JOIN user_roles ON user_roles.user_id = users.id JOIN roles ON roles.id = user_roles.role_id WHERE users.email = 'ada@foreignafrica.org'");
    const [draft] = await other.execute("SELECT slug, status FROM content_items WHERE title = 'Private note'");
    assert.match(article[0].title, /BRICS/);
    assert.equal(article[0].status, 'published');
    assert.equal(role[0].role_key, 'super_admin');
    assert.equal(draft[0].status, 'draft');
    assert.equal(existsSync(join(otherRoot, media[0].storage_path)), true);
    const restoredApp = createApp({config: {...config, mediaRoot: otherRoot}, pool: other, clock});
    const site = await listen(restoredApp);
    try {
      assert.equal((await call(site.url, `/api/public/content/commentary/${draft[0].slug}`)).status, 404);
      const visible = await call(site.url, '/api/public/content/commentary/ghanas-brics-ambitions-polarisation-asymmetry-and-the-political-economy-of-international-participation');
      assert.equal(visible.status, 200);
      assert.match(visible.data.item.html, /Samuel Okudzeto Ablakwa/);
    } finally {await new Promise(resolve => site.server.close(resolve));}
    await other.end();
  });

  await new Promise(resolve => server.close(resolve));
  const dist = mkdtempSync(join(tmpdir(), 'fa-dist-'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html><html><head><title>Old</title><meta name="description" content="Old"></head><body><div id="root"></div></body></html>');
  const site = createSite({config, pool, dist, clock});
  const hosted = await listen(site);
  try {
    const response = await fetch(`${hosted.url}/blog/ghanas-brics-ambitions-polarisation-asymmetry-and-the-political-economy-of-international-participation/`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /Samuel Okudzeto Ablakwa/);
    assert.match(html, /canonical" href="http:\/\/127.0.0.1:9\/ghanas-brics-ambitions-polarisation-asymmetry-and-the-political-economy-of-international-participation\//);
  } finally {await new Promise(resolve => hosted.server.close(resolve));}
});
