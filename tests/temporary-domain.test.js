import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {blockingChecks, deploymentChecks} from '../server/deployment-checks.js';
import {readConfig} from '../server/config.js';
import {createSite} from '../server/site.js';
import {storageMarker} from '../server/media.js';
import {originAllowed} from '../server/text.js';

const temp = 'https://fa-staging-123.hostingersite.com';
const good = {APP_ENV: 'staging', PUBLIC_SITE_URL: temp, SESSION_SECRET: 's'.repeat(40), STAGING_USER: 'preview', STAGING_PASSWORD: 'a-long-staging-password', DB_HOST: '127.0.0.1', DB_USER: 'u', DB_NAME: 'fa_cms', MEDIA_ROOT: '/home/u/foreign-africa-media', CRON_SECRET: 'c'.repeat(40)};
const failing = env => blockingChecks(deploymentChecks(readConfig({...good, ...env}), {})).map(check => check.id);

test('a correct temporary-domain staging setup has nothing blocking and nothing to warn about', () => {
  const checks = deploymentChecks(readConfig(good), {});
  assert.deepEqual(blockingChecks(checks), []);
  assert.deepEqual(checks.filter(check => check.status === 'warn'), []);
});

test('unsafe staging settings are blocked', () => {
  assert.deepEqual(failing({PUBLIC_SITE_URL: 'http://fa-staging-123.hostingersite.com'}), ['public_url'], 'plain http breaks secure cookies');
  assert.deepEqual(failing({PUBLIC_SITE_URL: 'https://foreignafrica.org'}), ['public_url'], 'staging must never claim the production address');
  assert.deepEqual(failing({PUBLIC_SITE_URL: 'https://www.foreignafrica.org'}), ['public_url']);
  assert.deepEqual(failing({PUBLIC_SITE_URL: `${temp}/app/`}), ['public_url'], 'origin only');
  assert.deepEqual(failing({PUBLIC_SITE_URL: 'not a url'}), ['public_url']);
  assert.deepEqual(failing({SESSION_SECRET: 'short'}), ['session_secret']);
  assert.deepEqual(failing({STAGING_USER: '', STAGING_PASSWORD: ''}), ['staging_gate']);
  assert.deepEqual(failing({DB_NAME: ''}), ['database']);
  assert.deepEqual(failing({MEDIA_ROOT: '/home/u/domains/site/public_html/uploads'}), ['media'], 'uploads inside the deployment folder would be lost');
  assert.deepEqual(failing({MEDIA_ROOT: '/home/u/hbuilds/app/media'}), ['media']);
});

test('missing optional pieces warn but do not block; leftover secrets are flagged', () => {
  const checks = deploymentChecks(readConfig({...good, MEDIA_ROOT: '', CRON_SECRET: ''}), {BOOTSTRAP_ADMIN_PASSWORD: 'x', CMS_PASSWORD: 'y'});
  assert.deepEqual(blockingChecks(checks), []);
  assert.deepEqual(checks.filter(c => c.status === 'warn').map(c => c.id).sort(), ['bootstrap', 'cron', 'legacy_password', 'media']);
});

test('the origin check accepts the temporary domain only', () => {
  const config = readConfig(good);
  assert.equal(originAllowed(temp, config, 'fa-staging-123.hostingersite.com'), true);
  assert.equal(originAllowed('https://foreignafrica.org', config, 'fa-staging-123.hostingersite.com'), false);
  assert.equal(originAllowed('http://fa-staging-123.hostingersite.com', config, 'x'), false, 'a different scheme is a different origin');
  assert.equal(originAllowed('https://evil.example', config, 'fa-staging-123.hostingersite.com'), false);
  assert.equal(originAllowed(undefined, config, 'fa-staging-123.hostingersite.com'), false, 'writes without an Origin are refused outside development');
});

test('storage marker proves persistence only after a restart', async () => {
  const root = mkdtempSync(join(tmpdir(), 'fa-marker-'));
  const first = await storageMarker(root, {now: 1000, processStart: 500});
  assert.equal(first.survivedRestart, false, 'just written');
  const sameProcess = await storageMarker(root, {processStart: 500});
  assert.equal(sameProcess.survivedRestart, false, 'still the process that wrote it');
  const afterRedeploy = await storageMarker(root, {processStart: Date.parse(first.createdAt) + 60000});
  assert.equal(afterRedeploy.survivedRestart, true, 'a later process finds the marker');
  assert.equal(afterRedeploy.createdAt, first.createdAt);
});

test('the staging site behind the temporary domain: gated, never indexed, deep links work, cron is reachable', async t => {
  const dist = mkdtempSync(join(tmpdir(), 'fa-dist-'));
  mkdirSync(dist, {recursive: true});
  writeFileSync(join(dist, 'index.html'), '<!doctype html><html><head><title>Foreign Africa</title></head><body><div id="root"></div></body></html>');
  const config = {...readConfig(good), dbHost: '', dbUser: '', dbName: ''};
  const server = await new Promise(resolve => { const s = createSite({config, pool: null, dist}).listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}`;
  const basic = `Basic ${Buffer.from('preview:a-long-staging-password').toString('base64')}`;
  const proxy = {Host: 'fa-staging-123.hostingersite.com', 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '203.0.113.5'};
  const get = (path, headers = {}, method = 'GET') => fetch(`${url}${path}`, {method, headers: {...proxy, ...headers}, redirect: 'manual'});

  for (const path of ['/', '/admin', '/api/staff/session', '/news/', '/robots.txt', '/sitemap.xml']) {
    const response = await get(path);
    assert.equal(response.status, 401, `${path} needs the staging password`);
    assert.match(response.headers.get('x-robots-tag'), /noindex/, `${path}: even the sign-in challenge says noindex`);
    assert.match(response.headers.get('www-authenticate'), /Basic/);
  }
  assert.equal((await get('/', {Authorization: 'Basic ' + Buffer.from('preview:wrong').toString('base64')})).status, 401);

  for (const path of ['/', '/admin', '/admin/', '/editor/', '/news/some-article/', '/blog/', '/policy-briefs/', '/people/rexford-akrong/', '/?story=kigali-engagement', '/opportunities/fellowships/']) {
    const response = await get(path, {Authorization: basic});
    assert.equal(response.status, 200, path);
    assert.match(await response.text(), /<div id="root">/, `${path} serves the app shell so a refresh or shared link works`);
    assert.match(response.headers.get('x-robots-tag'), /noindex, nofollow/);
  }
  const robots = await (await get('/robots.txt', {Authorization: basic})).text();
  assert.equal(robots, 'User-agent: *\nDisallow: /\n');
  assert.equal((await get('/sitemap.xml', {Authorization: basic})).status, 404, 'no sitemap outside production');
  assert.equal((await get('/api/health', {Authorization: basic})).status, 503, 'health reports no database rather than crashing');

  // The scheduler cannot send the Basic password, so the cron path has its own secret instead.
  const noToken = await get('/api/cron/publish', {}, 'POST');
  assert.equal(noToken.status, 401);
  assert.equal(noToken.headers.get('www-authenticate'), null, 'an API caller is not sent a browser password prompt');
  const withToken = await get('/api/cron/publish', {Authorization: `Bearer ${good.CRON_SECRET}`}, 'POST');
  assert.equal(withToken.status, 503, 'authenticated, then reports that no database is configured here');
  const plainHttp = await fetch(`${url}/api/cron/publish`, {method: 'POST', headers: {Host: 'fa-staging-123.hostingersite.com', Authorization: `Bearer ${good.CRON_SECRET}`}});
  assert.equal(plainHttp.status, 400, 'the cron endpoint refuses plain http');
});
