import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {createSite} from '../server/site.js';
import {mediaRootProblem} from '../server/media.js';

const dist = mkdtempSync(join(tmpdir(), 'fa-staging-'));
writeFileSync(join(dist, 'index.html'), '<!doctype html><html><head><title>Old</title></head><body><div id="root"></div></body></html>');

const config = {
  appEnv: 'staging',
  publicSiteUrl: 'https://preview.foreignafrica.org',
  sessionSecret: 'test-secret',
  cookieSecure: true,
  passwordCost: 4,
  mediaRoot: '',
  stagingUser: 'preview',
  stagingPassword: 'preview-pass-123',
  dbHost: '',
  dbUser: '',
  dbName: '',
};
const auth = {Authorization: `Basic ${Buffer.from('preview:preview-pass-123').toString('base64')}`};

function listen(app) {
  const server = createServer(app);
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({server, url: `http://127.0.0.1:${server.address().port}`})));
}

test('staging serves one origin, locks visitors out, and keeps uploads off', async () => {
  assert.match(mediaRootProblem(''), /not set/);
  assert.match(mediaRootProblem('/home/user/domains/preview.foreignafrica.org/hbuilds/current'), /deployment directory/);
  assert.match(mediaRootProblem('C:\\site\\public_html\\uploads'), /deployment directory/);
  assert.equal(mediaRootProblem('/home/user/foreign-africa-media'), '');

  const site = createSite({config, pool: null, dist});
  const {server, url} = await listen(site);
  try {
    assert.equal((await fetch(`${url}/admin`)).status, 401);
    assert.equal((await fetch(`${url}/editor/`)).status, 401);
    const home = await fetch(`${url}/`, {headers: auth});
    assert.equal(home.status, 200);
    assert.match(await home.text(), /id="root"/);
    const admin = await fetch(`${url}/admin`, {headers: auth});
    assert.equal(admin.status, 200);
    assert.match(await admin.text(), /id="root"/);
    const editor = await fetch(`${url}/editor/`, {headers: auth});
    assert.equal(editor.status, 200);
    const robots = await fetch(`${url}/robots.txt`, {headers: auth});
    assert.match(await robots.text(), /Disallow: \//);
    assert.equal((await fetch(`${url}/sitemap.xml`, {headers: auth})).status, 404);
    const discover = await fetch(`${url}/api/discover`, {method: 'POST', headers: {...auth, 'Content-Type': 'application/json'}, body: JSON.stringify({query: 'Find meeting recordings'})});
    const discovery = await discover.json();
    assert.equal(discover.status, 200);
    assert.equal(discovery.mode, 'directory');
    assert.equal((await fetch(`${url}/api/discover`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({query: 'internship'})})).status, 401);
    const session = await fetch(`${url}/api/cms/session`, {headers: auth});
    assert.equal(session.status, 200);
    assert.equal((await session.json()).ok, false);
    const upload = await fetch(`${url}/api/staff/media`, {method: 'POST', headers: auth});
    assert.equal(upload.status, 503);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
