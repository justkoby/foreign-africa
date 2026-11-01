import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.js';
import {allows} from '../server/permissions.js';
import {migrationFiles, statementsFrom} from '../server/migrate.js';
import {renderContentPage, robotsText} from '../server/html.js';
import {originAllowed, bodyHtml} from '../server/text.js';

const config = {appEnv: 'test', publicSiteUrl: 'http://127.0.0.1:9', sessionSecret: 'test-secret', cookieSecure: false, passwordCost: 4, mediaRoot: '', stagingUser: '', stagingPassword: '', dbHost: '', dbUser: '', dbName: ''};

function listen(app) {
  return new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => resolve({server, url: `http://127.0.0.1:${server.address().port}`}));
  });
}

test('permissions let editors publish and keep contributors on their own drafts', () => {
  assert.equal(allows(['editor'], 'content.publish'), true);
  assert.equal(allows(['admin'], 'content.publish'), true);
  assert.equal(allows(['super_admin'], 'content.publish'), true);
  assert.equal(allows(['contributor'], 'content.publish'), false);
  assert.equal(allows(['contributor'], 'content.update.own'), true);
  assert.equal(allows(['contributor'], 'content.update.any'), false);
  assert.equal(allows(['contributor'], 'users.manage'), false);
  assert.equal(allows(['admin'], 'users.assign_super'), false);
  assert.equal(allows(['super_admin'], 'users.assign_super'), true);
});

test('article html escapes script and keeps the paragraph text', () => {
  const html = bodyHtml('Hello\n\n<script>alert(1)</script>');
  assert.match(html, /<p>Hello<\/p>/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test('staging pages are not indexable and cannot claim the production domain', () => {
  assert.match(robotsText({appEnv: 'staging', publicSiteUrl: 'https://preview.foreignafrica.org'}), /Disallow: \//);
  assert.match(robotsText({appEnv: 'production', publicSiteUrl: 'https://foreignafrica.org'}), /Sitemap: https:\/\/foreignafrica.org\/sitemap.xml/);
  assert.throws(() => renderContentPage({appEnv: 'staging', publicSiteUrl: 'https://foreignafrica.org'}, {content_type: 'news', slug: 'mission', title: 'Mission', summary: 'A summary', seo_title: '', seo_description: '', published_at: null, body_html: '<p>Body</p>'}), /production domain/);
  const page = renderContentPage({appEnv: 'staging', publicSiteUrl: 'https://preview.foreignafrica.org'}, {content_type: 'news', slug: 'mission', title: 'Mission', summary: 'A summary', seo_title: '', seo_description: '', published_at: null, body_html: '<p>Across East Africa</p>'});
  assert.match(page, /noindex/);
  assert.match(page, /Across East Africa/);
  assert.match(page, /https:\/\/preview\.foreignafrica\.org\/news\/mission\//);
  assert.doesNotMatch(page, /canonical" href="https:\/\/foreignafrica\.org/);
});

test('production mutations reject a foreign origin', async () => {
  const app = createApp({config: {...config, appEnv: 'production', publicSiteUrl: 'https://foreignafrica.org'}, pool: {async execute() {throw new Error('database should not be queried');}, async query() {throw new Error('database should not be queried');}}});
  const {server, url} = await listen(app);
  try {
    const denied = await fetch(`${url}/api/staff/login`, {method: 'POST', headers: {'Content-Type': 'application/json', Origin: 'https://evil.example'}, body: '{}'});
    assert.equal(denied.status, 403);
    const missing = await fetch(`${url}/api/staff/login`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'});
    assert.equal(missing.status, 403);
  } finally {await new Promise(resolve => server.close(resolve));}
});

test('an unreachable database reports failure without a stack trace', async () => {
  const app = createApp({config, pool: {async query() {throw new Error('connect ECONNREFUSED 127.0.0.1 password=secret');}}});
  const {server, url} = await listen(app);
  try {
    const health = await fetch(`${url}/api/health`);
    const body = await health.json();
    assert.equal(health.status, 503);
    assert.equal(body.ok, false);
    assert.equal(JSON.stringify(body).includes('secret'), false);
  } finally {await new Promise(resolve => server.close(resolve));}
});

test('staging stays closed until its access password is configured', async () => {
  const closed = createApp({config: {...config, appEnv: 'staging', publicSiteUrl: 'https://preview.foreignafrica.org'}});
  const open = createApp({config: {...config, appEnv: 'staging', publicSiteUrl: 'https://preview.foreignafrica.org', stagingUser: 'preview', stagingPassword: 'preview-pass-123'}});
  const first = await listen(closed);
  const second = await listen(open);
  try {
    assert.equal((await fetch(`${first.url}/robots.txt`)).status, 503);
    assert.equal((await fetch(`${second.url}/sitemap.xml`)).status, 401);
    const robots = await fetch(`${second.url}/robots.txt`, {headers: {Authorization: `Basic ${Buffer.from('preview:preview-pass-123').toString('base64')}`}});
    assert.equal(robots.status, 200);
    assert.match(await robots.text(), /Disallow: \//);
    const sitemap = await fetch(`${second.url}/sitemap.xml`, {headers: {Authorization: `Basic ${Buffer.from('preview:preview-pass-123').toString('base64')}`}});
    assert.equal(sitemap.status, 404);
  } finally {
    await new Promise(resolve => first.server.close(resolve));
    await new Promise(resolve => second.server.close(resolve));
  }
});

test('migration files run in order and duplicate ids are rejected', () => {
  assert.deepEqual(statementsFrom('-- note\nCREATE TABLE a (id INT);\n\nINSERT INTO a VALUES (1);'), ['CREATE TABLE a (id INT)', 'INSERT INTO a VALUES (1)']);
  const directory = mkdtempSync(join(tmpdir(), 'fa-migrations-'));
  writeFileSync(join(directory, '002_b.sql'), 'SELECT 1;');
  writeFileSync(join(directory, '001_a.sql'), 'SELECT 1;');
  assert.deepEqual(migrationFiles(directory), ['001_a.sql', '002_b.sql']);
  writeFileSync(join(directory, '001_a.sql'), 'SELECT 1;');
  writeFileSync(join(directory, '001_other.sql'), 'SELECT 1;');
  assert.throws(() => migrationFiles(directory), /same number/);
});

test('development allows a same-host origin and rejects another site', () => {
  assert.equal(originAllowed('http://localhost:5173', {appEnv: 'development', publicSiteUrl: 'http://localhost:5173'}, 'localhost:5173'), true);
  assert.equal(originAllowed('https://evil.example', {appEnv: 'production', publicSiteUrl: 'https://foreignafrica.org'}, 'foreignafrica.org'), false);
});
