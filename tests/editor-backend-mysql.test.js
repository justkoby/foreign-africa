import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {createDisposableMysql} from './helpers/mysql.js';
import {createPool} from '../server/db.js';
import {migrate, migrationsDirectory} from '../server/migrate.js';
import {createApp} from '../server/app.js';
import {provisionAdmin} from '../server/store.js';

const password = 'correct-horse-battery';
const origin = 'http://127.0.0.1:9';

test('editor backend: tables, video, terms and the media library (real database and files)', {timeout: 300000}, async t => {
  let database;
  try { database = await createDisposableMysql(); } catch (error) { return t.skip(`Database could not be started: ${error.message}`); }
  const pool = createPool({dbHost: '127.0.0.1', dbPort: database.port, dbUser: database.username, dbPassword: '', dbName: database.dbName});
  const mediaRoot = mkdtempSync(join(tmpdir(), 'fa-media-'));
  const config = {appEnv: 'test', publicSiteUrl: origin, sessionSecret: 'test-secret', cookieSecure: false, passwordCost: 4, mediaRoot, stagingUser: '', stagingPassword: '', legacyFileEditing: false};
  const clock = () => Date.parse('2026-10-25T12:00:00Z');
  await migrate({pool, directory: migrationsDirectory});
  await provisionAdmin({pool, config, clock, email: 'ada@foreignafrica.org', name: 'Ada Admin', password});
  const server = await new Promise(resolve => { const s = createApp({config, pool, clock}).listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(async () => { server.close(); await pool.end(); await database.stop(); });
  const url = `http://127.0.0.1:${server.address().port}`;

  async function call(path, {method = 'GET', body, cookie, form, headers = {}} = {}) {
    const response = await fetch(`${url}${path}`, {method, headers: {...(form ? {} : {'Content-Type': 'application/json'}), Origin: origin, ...(cookie ? {Cookie: cookie} : {}), ...headers}, body: form ?? (body === undefined ? undefined : JSON.stringify(body))});
    const set = (response.headers.get('set-cookie') || '').split(';')[0];
    const buffer = Buffer.from(await response.arrayBuffer());
    let data = {}; try { data = JSON.parse(buffer.toString()); } catch { /* binary or html */ }
    return {status: response.status, data, buffer, headers: response.headers, cookie: set.startsWith('fa_staff=') ? set : cookie};
  }
  const login = async email => (await call('/api/staff/login', {method: 'POST', body: {email, password}})).cookie;
  const admin = await login('ada@foreignafrica.org');
  for (const [name, email, role] of [['Eden Editor', 'eden@foreignafrica.org', 'editor'], ['Cori Contributor', 'cori@foreignafrica.org', 'contributor'], ['Cara Contributor', 'cara@foreignafrica.org', 'contributor']]) await call('/api/staff/users', {method: 'POST', cookie: admin, body: {name, email, role, password}});
  const editor = await login('eden@foreignafrica.org');
  const cori = await login('cori@foreignafrica.org');
  const cara = await login('cara@foreignafrica.org');
  const png = (w, h, colour) => sharp({create: {width: w, height: h, channels: 3, background: colour}}).png().toBuffer();
  const upload = async (cookie, buffer, name, type) => { const form = new FormData(); form.append('file', new Blob([buffer], {type}), name); return call('/api/staff/media', {method: 'POST', cookie, form}); };

  await t.test('tables and an approved video are stored, sanitised and rendered on the public page', async () => {
    const cell = (text, type = 'tableCell') => ({type, content: [{type: 'paragraph', content: [{type: 'text', text}]}]});
    const document = {type: 'doc', content: [
      {type: 'paragraph', content: [{type: 'text', text: 'Intro'}]},
      {type: 'table', content: [{type: 'tableRow', content: [cell('Country', 'tableHeader'), cell('Share', 'tableHeader')]}, {type: 'tableRow', content: [cell('Ghana'), cell('12%')]}]},
      {type: 'video', attrs: {url: 'https://youtu.be/dQw4w9WgXcQ', caption: 'The talk'}},
    ]};
    const made = await call('/api/staff/content', {method: 'POST', cookie: editor, body: {type: 'commentary', title: 'Rich article', summary: 's', document}});
    assert.equal(made.status, 201, JSON.stringify(made.data));
    await call(`/api/staff/content/${made.data.item.id}/state`, {method: 'POST', cookie: editor, body: {status: 'published'}});
    const page = await call('/api/public/content/commentary/rich-article');
    assert.equal(page.status, 200);
    assert.match(page.data.item.html, /<div class="article-table"><table><thead><tr><th scope="col"><p>Country<\/p><\/th>/);
    assert.match(page.data.item.html, /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
    const evil = await call('/api/staff/content', {method: 'POST', cookie: editor, body: {type: 'commentary', title: 'Evil', summary: 's', document: {type: 'doc', content: [{type: 'video', attrs: {url: 'https://evil.example/watch?v=dQw4w9WgXcQ'}}]}}});
    assert.equal(evil.status, 400);
  });

  await t.test('categories and tags: create, rename, protect names, merge, and guarded delete', async () => {
    assert.equal((await call('/api/staff/terms', {method: 'POST', cookie: cori, body: {vocabulary: 'tag', name: 'Nope'}})).status, 403, 'contributors cannot manage terms');
    assert.equal((await call('/api/staff/terms')).status, 401);
    const cat = await call('/api/staff/terms', {method: 'POST', cookie: editor, body: {vocabulary: 'category', name: 'Diplomacy'}});
    assert.equal(cat.status, 201); assert.equal(cat.data.term.slug, 'diplomacy');
    assert.equal((await call('/api/staff/terms', {method: 'POST', cookie: editor, body: {vocabulary: 'category', name: 'diplomacy'}})).status, 409, 'duplicate slug');
    assert.equal((await call('/api/staff/terms', {method: 'POST', cookie: editor, body: {vocabulary: 'colour', name: 'x'}})).status, 400);
    assert.equal((await call('/api/staff/terms', {method: 'POST', cookie: editor, body: {vocabulary: 'tag', name: '   '}})).status, 400);
    const trade = (await call('/api/staff/terms', {method: 'POST', cookie: editor, body: {vocabulary: 'tag', name: 'Trade'}})).data.term;
    const commerce = (await call('/api/staff/terms', {method: 'POST', cookie: editor, body: {vocabulary: 'tag', name: 'Commerce'}})).data.term;

    // Typing a differently-cased category on an article must not rename the shared category.
    const a = await call('/api/staff/content', {method: 'POST', cookie: cori, body: {type: 'news', title: 'Tagged A', summary: 's', body: 'b', category: 'diplomacy', tags: ['Trade', 'New tag']}});
    const b = await call('/api/staff/content', {method: 'POST', cookie: cori, body: {type: 'news', title: 'Tagged B', summary: 's', body: 'b', category: 'Diplomacy', tags: ['Commerce']}});
    assert.equal(a.status, 201);
    const listed = (await call('/api/staff/terms?vocabulary=category', {cookie: editor})).data.terms;
    assert.equal(listed.find(x => x.slug === 'diplomacy').name, 'Diplomacy', 'the category keeps its name');
    assert.equal(listed.find(x => x.slug === 'diplomacy').uses, 2);
    const tags = (await call('/api/staff/terms?vocabulary=tag&q=tra', {cookie: cori})).data.terms;
    assert.deepEqual(tags.map(x => x.name), ['Trade']);

    const renamed = await call(`/api/staff/terms/${trade.id}`, {method: 'PATCH', cookie: editor, body: {name: 'Trade policy', slug: 'trade-policy'}});
    assert.equal(renamed.data.term.slug, 'trade-policy');
    assert.equal((await call(`/api/staff/terms/${trade.id}`, {method: 'PATCH', cookie: editor, body: {slug: 'commerce'}})).status, 409);

    assert.equal((await call(`/api/staff/terms/${commerce.id}`, {method: 'DELETE', cookie: editor})).status, 409, 'in use: needs an explicit choice');
    assert.equal((await call(`/api/staff/terms/${commerce.id}?mergeInto=${commerce.id}`, {method: 'DELETE', cookie: editor})).status, 400);
    assert.equal((await call(`/api/staff/terms/${commerce.id}?mergeInto=${cat.data.term.id}`, {method: 'DELETE', cookie: editor})).status, 400, 'cannot merge across kinds');
    assert.equal((await call(`/api/staff/terms/${commerce.id}?mergeInto=${trade.id}`, {method: 'DELETE', cookie: editor})).status, 200);
    const afterMerge = (await call('/api/staff/terms?vocabulary=tag', {cookie: editor})).data.terms;
    assert.equal(afterMerge.find(x => x.id === commerce.id), undefined);
    assert.equal(afterMerge.find(x => x.id === trade.id).uses, 2, 'both articles now carry the merged tag');
    const newTag = afterMerge.find(x => x.name === 'New tag');
    assert.equal((await call(`/api/staff/terms/${newTag.id}?detach=1`, {method: 'DELETE', cookie: editor})).status, 200);
    const item = (await call(`/api/staff/content/${a.data.item.id}`, {cookie: editor})).data.item;
    assert.ok(!item.tags.includes('New tag'), 'the article was detached from the deleted tag');
    const [logs] = await pool.query("SELECT action FROM activity_logs WHERE subject_type = 'term'");
    for (const action of ['term.created', 'term.updated', 'term.merged', 'term.deleted']) assert.ok(logs.some(l => l.action === action), action);
  });

  let imageId, otherId, docId, cookieArticleId;
  await t.test('media: upload, metadata, ownership, filters, pagination', async () => {
    const first = await upload(cori, await png(60, 40, '#cc0000'), 'Red Logo.PNG', 'image/png');
    assert.equal(first.status, 201, JSON.stringify(first.data));
    imageId = first.data.asset.id;
    assert.deepEqual([first.data.asset.width, first.data.asset.height, first.data.asset.kind], [60, 40, 'image']);
    otherId = (await upload(editor, await png(30, 30, '#00cc00'), 'green.png', 'image/png')).data.asset.id;
    const pdf = await upload(editor, Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'), 'Report.pdf', 'application/pdf');
    assert.equal(pdf.status, 201); docId = pdf.data.asset.id;
    assert.equal((await upload(editor, Buffer.from('<script>alert(1)</script>'), 'x.png', 'image/png')).status, 400, 'content, not the file name or type, decides');

    const meta = await call(`/api/staff/media/${imageId}`, {method: 'PATCH', cookie: cori, body: {alt: ' A red   logo ', caption: 'Our logo', title: 'Logo'}});
    assert.equal(meta.status, 200); assert.equal(meta.data.asset.alt, 'A red logo');
    assert.equal((await call(`/api/staff/media/${imageId}`, {method: 'PATCH', cookie: cara, body: {alt: 'hijack'}})).status, 403, 'a contributor cannot edit someone else\'s file');
    assert.equal((await call(`/api/staff/media/${imageId}`, {method: 'PATCH', cookie: editor, body: {alt: 'Edited by editor'}})).status, 200);
    assert.equal((await call(`/api/staff/media/${imageId}`, {method: 'PATCH', cookie: editor, body: {alt: 5}})).status, 400);
    assert.equal((await call(`/api/staff/media/${imageId}`, {method: 'PATCH', cookie: editor, body: {}})).status, 400);

    const images = (await call('/api/staff/media?type=image', {cookie: cara})).data;
    assert.deepEqual(images.files.map(f => f.kind), ['image', 'image']);
    assert.equal((await call('/api/staff/media?type=document', {cookie: cara})).data.files[0].name, 'Report.pdf');
    assert.equal((await call('/api/staff/media?q=edited', {cookie: cara})).data.files.length, 1, 'search covers alt text');
    assert.equal((await call('/api/staff/media?q=%25', {cookie: cara})).data.files.length, 0, 'a literal % is not a wildcard');
    assert.equal((await call('/api/staff/media?type=video', {cookie: cara})).status, 400);
    const paged = (await call('/api/staff/media?pageSize=2&page=2&sort=oldest', {cookie: cara})).data;
    assert.deepEqual([paged.total, paged.files.length, paged.page], [3, 1, 2]);
    assert.equal((await call('/api/staff/media?sort=name', {cookie: cara})).data.files[0].name, 'green.png');
  });

  await t.test('media: usage, safe delete and replacement keep every article intact', async () => {
    const article = await call('/api/staff/content', {method: 'POST', cookie: editor, body: {type: 'news', title: 'Uses image', summary: 's', featuredMediaId: imageId, document: {type: 'doc', content: [{type: 'image', attrs: {src: `/media/${imageId}`, alt: 'a', caption: ''}}]}}});
    cookieArticleId = article.data.item.id;
    const usage = (await call(`/api/staff/media/${imageId}`, {cookie: editor})).data.usage;
    assert.equal(usage.length, 1); assert.deepEqual(usage[0].as, ['featured image', 'in the article']);
    assert.equal((await call(`/api/staff/media/${imageId}`, {method: 'DELETE', cookie: editor})).status, 409, 'a used file cannot be deleted');

    const before = (await call(`/media/${imageId}`)).headers;
    const etag = before.get('etag');
    assert.ok(etag && /must-revalidate/.test(before.get('cache-control')) && !/immutable/.test(before.get('cache-control')));
    assert.equal((await call(`/media/${imageId}`, {headers: {'If-None-Match': etag}})).status, 304);
    const thumb = await call(`/media/${imageId}/thumb`);
    assert.equal(thumb.status, 200, 'the thumbnail address handed out by the API must exist');
    assert.equal(thumb.headers.get('content-type'), 'image/webp');
    assert.ok((await sharp(thumb.buffer).metadata()).width <= 480);
    assert.equal((await call('/media/999999/thumb')).status, 404);
    const oldFiles = readdirSync(join(mediaRoot, 'files'));

    const form = new FormData(); form.append('file', new Blob([await png(120, 80, '#0000cc')], {type: 'image/png'}), 'blue.png');
    assert.equal((await call(`/api/staff/media/${imageId}/replace`, {method: 'POST', cookie: cori, form})).status, 403, 'replacing affects every article, so it needs edit rights');
    const replaced = await call(`/api/staff/media/${imageId}/replace`, {method: 'POST', cookie: editor, form});
    assert.equal(replaced.status, 200, JSON.stringify(replaced.data));
    assert.deepEqual([replaced.data.asset.id, replaced.data.asset.url, replaced.data.asset.width], [imageId, `/media/${imageId}`, 120], 'same id and URL, new pixels');
    assert.equal(replaced.data.asset.alt, 'Edited by editor', 'metadata is kept');
    const after = await call(`/media/${imageId}`, {headers: {'If-None-Match': etag}});
    assert.equal(after.status, 200, 'the old ETag no longer matches, so browsers fetch the new image');
    assert.equal((await sharp(after.buffer).metadata()).width, 120);
    const newFiles = readdirSync(join(mediaRoot, 'files'));
    assert.equal(newFiles.length, oldFiles.length, 'the old file was removed after the swap');
    const still = (await call(`/api/staff/content/${cookieArticleId}`, {cookie: editor})).data.item;
    assert.equal(still.featuredMediaId, imageId);

    const bad = new FormData(); bad.append('file', new Blob([Buffer.from('%PDF-1.4\n%%EOF')], {type: 'application/pdf'}), 'x.pdf');
    assert.equal((await call(`/api/staff/media/${imageId}/replace`, {method: 'POST', cookie: editor, form: bad})).status, 400, 'an image cannot become a PDF');
    assert.equal((await call(`/api/staff/media/999999/replace`, {method: 'POST', cookie: editor, form: bad})).status, 404);
    // Unused files can be deleted and their files are removed.
    const doomed = (await upload(editor, await png(10, 10, '#111111'), 'bin.png', 'image/png')).data.asset;
    assert.equal((await call(`/api/staff/media/${doomed.id}`, {method: 'DELETE', cookie: editor})).status, 200);
    assert.equal((await call(`/media/${doomed.id}`)).status, 404);
    assert.equal((await call(`/api/staff/media/${otherId}`, {method: 'DELETE', cookie: editor})).status, 200);
    assert.ok(existsSync(join(mediaRoot, 'files')));
  });
});
