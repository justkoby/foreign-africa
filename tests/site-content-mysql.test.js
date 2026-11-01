import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {createDisposableMysql} from './helpers/mysql.js';
import {createPool} from '../server/db.js';
import {migrate, migrationsDirectory} from '../server/migrate.js';
import {createSite} from '../server/site.js';
import {provisionAdmin} from '../server/store.js';
import {defaultHero, defaultHomepage} from '../server/site-schema.js';
import {forgetPublished} from '../server/site-store.js';
import {siteDataScript} from '../server/site-inject.js';

const password = 'correct-horse-battery';
const origin = 'http://127.0.0.1:9';

test('siteDataScript cannot be broken out of', () => {
  const sep = String.fromCharCode(0x2028) + String.fromCharCode(0x2029) + '&';
  const html = siteDataScript({a: '</script><img src=x onerror=alert(1)>', b: sep});
  assert.equal((html.match(/<script/g) || []).length, 1);
  assert.equal((html.match(/<\/script>/g) || []).length, 1, 'only the real closing tag');
  const body = html.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
  assert.ok(!/[<>&]/.test(body) && !body.includes(String.fromCharCode(0x2028)) && !body.includes(String.fromCharCode(0x2029)));
  assert.deepEqual(JSON.parse(body), {a: '</script><img src=x onerror=alert(1)>', b: sep});
});

test('homepage and hero content: draft/publish workflow (real database)', {timeout: 300000}, async t => {
  let database;
  try { database = await createDisposableMysql(); } catch (error) { return t.skip(`Database could not be started: ${error.message}`); }
  const pool = createPool({dbHost: '127.0.0.1', dbPort: database.port, dbUser: database.username, dbPassword: '', dbName: database.dbName});
  const mediaRoot = mkdtempSync(join(tmpdir(), 'fa-media-'));
  const dist = mkdtempSync(join(tmpdir(), 'fa-dist-'));
  mkdirSync(dist, {recursive: true});
  writeFileSync(join(dist, 'index.html'), '<!doctype html><html><head><title>Foreign Africa</title></head><body><div id="root"></div></body></html>');
  const config = {appEnv: 'test', publicSiteUrl: origin, sessionSecret: 'test-secret', cookieSecure: false, passwordCost: 4, mediaRoot, stagingUser: '', stagingPassword: '', legacyFileEditing: false, ctaExtraHosts: ''};
  let now = Date.parse('2026-10-25T12:00:00Z');
  const clock = () => now;
  await migrate({pool, directory: migrationsDirectory});
  await provisionAdmin({pool, config, clock, email: 'ada@foreignafrica.org', name: 'Ada Admin', password});
  const server = await new Promise(resolve => { const s = createSite({config, pool, dist, clock}).listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(async () => { server.close(); await pool.end(); await database.stop(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  async function call(path, {method = 'GET', body, cookie, form} = {}) {
    const response = await fetch(`${url}${path}`, {method, headers: {...(form ? {} : {'Content-Type': 'application/json'}), Origin: origin, ...(cookie ? {Cookie: cookie} : {})}, body: form ?? (body === undefined ? undefined : JSON.stringify(body))});
    const set = (response.headers.get('set-cookie') || '').split(';')[0];
    const text = await response.text();
    let data = {}; try { data = JSON.parse(text); } catch { /* html */ }
    return {status: response.status, data, text, headers: response.headers, cookie: set.startsWith('fa_staff=') ? set : cookie};
  }
  const login = async email => (await call('/api/staff/login', {method: 'POST', body: {email, password}})).cookie;
  const admin = await login('ada@foreignafrica.org');
  for (const [name, email, role] of [['Eden Editor', 'eden@foreignafrica.org', 'editor'], ['Cori Contributor', 'cori@foreignafrica.org', 'contributor'], ['Amy Admin', 'amy@foreignafrica.org', 'admin']]) await call('/api/staff/users', {method: 'POST', cookie: admin, body: {name, email, role, password}});
  const editor = await login('eden@foreignafrica.org');
  const contributor = await login('cori@foreignafrica.org');
  const amy = await login('amy@foreignafrica.org');
  const home = async () => (await call('/')).text;
  const live = async () => (await call('/api/public/site')).data;

  await t.test('nothing is published at first: the page carries no CMS data and the built-in content applies', async () => {
    assert.ok(!(await home()).includes('fa-site-data'));
    assert.deepEqual(await live(), {});
    const doc = await call('/api/staff/site/homepage', {cookie: editor});
    assert.equal(doc.status, 200);
    assert.deepEqual(doc.data.document, defaultHomepage(), 'an untouched draft is the current live content');
    assert.equal(doc.data.state.hasPublished, false);
    assert.equal(doc.data.state.hasUnpublishedChanges, false);
    assert.equal(doc.data.canPublish, false, 'editors cannot publish by default');
  });

  await t.test('permissions: contributors and anonymous users are refused everywhere', async () => {
    for (const [who, cookie, expected] of [['anonymous', undefined, 401], ['contributor', contributor, 403]]) {
      for (const [method, path, body] of [['GET', '/api/staff/site'], ['GET', '/api/staff/site/hero'], ['PUT', '/api/staff/site/hero', {document: defaultHero(), baseVersion: 0}], ['POST', '/api/staff/site/hero/publish', {}], ['POST', '/api/staff/site/hero/discard', {}], ['GET', '/api/staff/site/hero/revisions'], ['GET', '/api/staff/site/preview'], ['PUT', '/api/staff/site/settings', {editorsCanPublish: true}]]) {
        assert.equal((await call(path, {method, body, cookie})).status, expected, `${who} ${method} ${path}`);
      }
    }
    assert.equal((await call('/api/staff/site/nonsense', {cookie: editor})).status, 404);
    assert.equal((await call('/api/staff/site/settings', {method: 'PUT', cookie: editor, body: {editorsCanPublish: true}})).status, 403, 'editors cannot grant themselves publishing');
  });

  await t.test('validation: unknown fields, markup and bad links are rejected with field-level problems', async () => {
    const doc = defaultHomepage();
    doc.about.lead = '<b>bold</b>'; doc.about.css = 'x'; doc.focus.cards[0].href = 'javascript:alert(1)'; doc.layout = {};
    const bad = await call('/api/staff/site/homepage', {method: 'PUT', cookie: editor, body: {document: doc, baseVersion: 0}});
    assert.equal(bad.status, 400);
    const paths = bad.data.problems.map(p => p.path);
    for (const expected of ['about.lead', 'about.css', 'focus.cards[0].href', 'layout']) assert.ok(paths.includes(expected), expected);
    assert.equal((await call('/api/staff/site/homepage', {cookie: editor})).data.state.draftSavedAt, null, 'nothing was saved');
  });

  await t.test('drafts are private: saving never changes the live site, and publishing needs permission', async () => {
    const doc = defaultHomepage();
    doc.about.lead = 'A new lead sentence for testing.';
    doc.about.heading = ['New heading line one.', 'New heading line two.'];
    const saved = await call('/api/staff/site/homepage', {method: 'PUT', cookie: editor, body: {document: doc, baseVersion: 0}});
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.equal(saved.data.state.hasUnpublishedChanges, true);
    assert.deepEqual(await live(), {}, 'the public API still has nothing');
    assert.ok(!(await home()).includes('A new lead sentence'), 'the public page is unchanged by a draft');
    assert.equal((await call('/api/staff/site/homepage/publish', {method: 'POST', cookie: editor, body: {}})).status, 403);
    assert.deepEqual(await live(), {});

    // concurrent saves from the same base version: exactly one wins
    const next = {...doc, about: {...doc.about, lead: 'Second lead.'}};
    const results = await Promise.all([1, 2].map(n => call('/api/staff/site/homepage', {method: 'PUT', cookie: n === 1 ? editor : amy, body: {document: {...next, about: {...next.about, lead: `Lead ${n}.`}}, baseVersion: 1}})));
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409], 'two editors cannot silently overwrite each other');
    const stale = await call('/api/staff/site/homepage', {method: 'PUT', cookie: editor, body: {document: doc, baseVersion: 1}});
    assert.equal(stale.status, 409);
  });

  let publishedVersion;
  await t.test('an administrator publishes explicitly; the live page and API then carry the content', async () => {
    const draft = (await call('/api/staff/site/homepage', {cookie: amy})).data;
    assert.equal(draft.canPublish, true);
    const stale = await call('/api/staff/site/homepage/publish', {method: 'POST', cookie: amy, body: {baseVersion: draft.state.version - 1}});
    assert.equal(stale.status, 409, 'publishing a draft you have not seen is refused');
    const done = await call('/api/staff/site/homepage/publish', {method: 'POST', cookie: amy, body: {baseVersion: draft.state.version}});
    assert.equal(done.status, 200, JSON.stringify(done.data));
    assert.equal(done.data.state.hasUnpublishedChanges, false);
    publishedVersion = done.data.state.version;
    forgetPublished();
    const html = await home();
    assert.match(html, /<script id="fa-site-data" type="application\/json">/);
    assert.match(html, /Lead [12]\./);
    assert.equal((await live()).homepage.about.lead.startsWith('Lead'), true);
    const [logs] = await pool.query("SELECT action FROM activity_logs WHERE subject_type = 'site'");
    assert.ok(logs.some(l => l.action === 'site.published') && logs.some(l => l.action === 'site.draft.saved'));
  });

  await t.test('later draft edits stay private; discarding returns to the live version; restoring only touches the draft', async () => {
    const before = (await call('/api/staff/site/homepage', {cookie: editor})).data;
    const doc = before.document; doc.about.lead = 'Unfinished work in progress.';
    const saved = await call('/api/staff/site/homepage', {method: 'PUT', cookie: editor, body: {document: doc, baseVersion: before.state.version}});
    assert.equal(saved.status, 200);
    forgetPublished();
    assert.ok(!(await home()).includes('Unfinished work in progress.'), 'unfinished edits never go live on their own');
    const discarded = await call('/api/staff/site/homepage/discard', {method: 'POST', cookie: editor, body: {}});
    assert.equal(discarded.data.state.hasUnpublishedChanges, false);
    assert.match((await call('/api/staff/site/homepage', {cookie: editor})).data.document.about.lead, /^Lead [12]\.$/);

    const revisions = (await call('/api/staff/site/homepage/revisions', {cookie: editor})).data.revisions;
    assert.ok(revisions.some(r => r.kind === 'published') && revisions.some(r => r.kind === 'draft'));
    const oldDraft = revisions.find(r => r.kind === 'draft');
    const version = (await call('/api/staff/site/homepage', {cookie: editor})).data.state.version;
    const restored = await call('/api/staff/site/homepage/restore', {method: 'POST', cookie: editor, body: {revisionId: oldDraft.id, baseVersion: version}});
    assert.equal(restored.status, 200, JSON.stringify(restored.data));
    forgetPublished();
    assert.match(await home(), /Lead [12]\./, 'restoring an old version does not change the live page');
    assert.equal((await call('/api/staff/site/hero/restore', {method: 'POST', cookie: editor, body: {revisionId: oldDraft.id, baseVersion: 0}})).status, 404, 'a revision belongs to one area only');
  });

  await t.test('an administrator can let editors publish, and withdraw it again', async () => {
    assert.equal((await call('/api/staff/site/settings', {method: 'PUT', cookie: amy, body: {editorsCanPublish: 'yes'}})).status, 400);
    assert.equal((await call('/api/staff/site/settings', {method: 'PUT', cookie: amy, body: {editorsCanPublish: true}})).status, 200);
    const state = (await call('/api/staff/site/hero', {cookie: editor})).data;
    assert.equal(state.canPublish, true);
    await call('/api/staff/site/settings', {method: 'PUT', cookie: amy, body: {editorsCanPublish: false}});
    assert.equal((await call('/api/staff/site/hero', {cookie: editor})).data.canPublish, false);
  });

  await t.test('hero: edit a slide, add and reorder, enforce the limits, publish', async () => {
    const hero = (await call('/api/staff/site/hero', {cookie: editor})).data;
    assert.deepEqual(hero.document, defaultHero());
    const doc = JSON.parse(JSON.stringify(hero.document));
    doc.slides[0].description = 'Edited hero description.';
    const copy = JSON.parse(JSON.stringify(doc.slides[3])); copy.id = 'workshop-copy'; copy.title = 'A duplicated slide';
    doc.slides.splice(1, 0, copy);
    doc.slides[2].enabled = false;
    const bad = JSON.parse(JSON.stringify(doc)); bad.slides[0].duration = 1000; bad.slides[0].cta.href = 'https://evil.example/';
    assert.equal((await call('/api/staff/site/hero', {method: 'PUT', cookie: editor, body: {document: bad, baseVersion: 0}})).status, 400);
    const saved = await call('/api/staff/site/hero', {method: 'PUT', cookie: editor, body: {document: doc, baseVersion: 0}});
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    const allOff = JSON.parse(JSON.stringify(doc)); allOff.slides.forEach(s => { s.enabled = false; });
    const v = (await call('/api/staff/site/hero', {cookie: editor})).data.state.version;
    assert.equal((await call('/api/staff/site/hero', {method: 'PUT', cookie: editor, body: {document: allOff, baseVersion: v}})).status, 200, 'a draft may have every slide off');
    assert.equal((await call('/api/staff/site/hero/publish', {method: 'POST', cookie: amy, body: {}})).status, 400, 'but publishing needs one enabled slide');
    await call('/api/staff/site/hero', {method: 'PUT', cookie: editor, body: {document: doc, baseVersion: v + 1}});
    assert.equal((await call('/api/staff/site/hero/publish', {method: 'POST', cookie: amy, body: {}})).status, 200);
    forgetPublished();
    const slides = (await live()).hero.slides;
    assert.deepEqual(slides.map(s => s.id), ['our-story', 'workshop-copy', 'addis-mission', 'kigali-mission', 'startup-workshop', 'meet-interns']);
    assert.equal(slides[0].description, 'Edited hero description.');
    assert.equal(slides[2].enabled, false);
  });

  await t.test('preview serves the real site shell with the DRAFT embedded, never indexed, never cached', async () => {
    const doc = defaultHomepage(); doc.connect.emphasis = 'Draft-only emphasis.';
    const v = (await call('/api/staff/site/homepage', {cookie: editor})).data.state.version;
    await call('/api/staff/site/homepage', {method: 'PUT', cookie: editor, body: {document: doc, baseVersion: v}});
    const preview = await call('/api/staff/site/preview', {cookie: editor});
    assert.equal(preview.status, 200);
    assert.match(preview.headers.get('x-robots-tag'), /noindex/);
    assert.match(preview.headers.get('cache-control'), /no-store/);
    assert.match(preview.headers.get('content-security-policy'), /frame-ancestors 'self'/);
    assert.match(preview.text, /"preview":true/);
    assert.match(preview.text, /Draft-only emphasis\./);
    forgetPublished();
    assert.ok(!(await home()).includes('Draft-only emphasis.'), 'the public page does not show it');
  });

  await t.test('media: usage covers the homepage and hero, and a used image cannot be deleted', async () => {
    const png = await sharp({create: {width: 40, height: 30, channels: 3, background: '#336699'}}).png().toBuffer();
    const form = new FormData(); form.append('file', new Blob([png], {type: 'image/png'}), 'banner.png');
    const asset = (await call('/api/staff/media', {method: 'POST', cookie: editor, form})).data.asset;
    const doc = (await call('/api/staff/site/homepage', {cookie: editor})).data;
    const next = JSON.parse(JSON.stringify(doc.document)); next.engagement.image = {mediaId: asset.id};
    assert.equal((await call('/api/staff/site/homepage', {method: 'PUT', cookie: editor, body: {document: next, baseVersion: doc.state.version}})).status, 200);
    let usage = (await call(`/api/staff/media/${asset.id}`, {cookie: editor})).data.usage;
    assert.deepEqual(usage.map(u => [u.kind, u.id, u.status]), [['site', 'homepage', 'draft only']]);
    assert.equal((await call(`/api/staff/media/${asset.id}`, {method: 'DELETE', cookie: editor})).status, 409, 'a draft reference blocks deletion');
    assert.equal((await call('/api/staff/site/homepage/publish', {method: 'POST', cookie: amy, body: {}})).status, 200);
    usage = (await call(`/api/staff/media/${asset.id}`, {cookie: editor})).data.usage;
    assert.equal(usage[0].status, 'live');
    assert.equal((await call(`/api/staff/media/${asset.id}`, {method: 'DELETE', cookie: editor})).status, 409);
    assert.match((await call('/api/public/site')).text, new RegExp(`/media/${asset.id}`));
    // swapping it back frees the file
    const back = (await call('/api/staff/site/homepage', {cookie: editor})).data;
    const restore = JSON.parse(JSON.stringify(back.document)); restore.engagement.image = {src: '/images/engagement.jpg'};
    await call('/api/staff/site/homepage', {method: 'PUT', cookie: editor, body: {document: restore, baseVersion: back.state.version}});
    await call('/api/staff/site/homepage/publish', {method: 'POST', cookie: amy, body: {}});
    assert.equal((await call(`/api/staff/media/${asset.id}`, {method: 'DELETE', cookie: editor})).status, 200);
    now += 1;
  });
});
