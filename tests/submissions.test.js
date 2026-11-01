import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSubmission, csvCell} from '../server/submissions.js';
import {allows} from '../server/permissions.js';
import {readConfig} from '../server/config.js';
import {createHandler} from '../api/cms.js';

const form = {id: 'enquiry', fields: [
  {id: 'name', label: 'Your name', type: 'text', required: true},
  {id: 'email', label: 'Email address', type: 'email', required: true},
  {id: 'topic', label: 'Topic', type: 'select', options: ['A', 'B']},
  {id: 'message', label: 'Message', type: 'textarea'},
]};

test('submission validation accepts a good answer set and ignores undeclared keys', () => {
  const {errors, clean} = validateSubmission(form, {name: ' Ada ', email: 'ada@example.org', topic: 'A', message: 'Hi\nthere', admin: 'true', __proto__: {x: 1}});
  assert.deepEqual(errors, {});
  assert.deepEqual(clean, {name: 'Ada', email: 'ada@example.org', topic: 'A', message: 'Hi\nthere'});
});

test('submission validation rejects missing, malformed, oversized and non-string answers', () => {
  assert.ok(validateSubmission(form, {}).errors.name);
  assert.ok(validateSubmission(form, {name: 'A', email: 'not-an-email'}).errors.email);
  assert.ok(validateSubmission(form, {name: 'A', email: 'a@b.co', topic: 'C'}).errors.topic);
  assert.ok(validateSubmission(form, {name: 'A', email: 'a@b.co', message: 'x'.repeat(5001)}).errors.message);
  assert.ok(validateSubmission(form, {name: ['A'], email: 'a@b.co'}).errors.name);
  assert.ok(validateSubmission(form, {name: 'two\nlines', email: 'a@b.co'}).errors.name);
  assert.ok(validateSubmission(form, null).errors._form);
  assert.ok(validateSubmission(form, [1]).errors._form);
});

test('csv cells are quoted and spreadsheet formulas are defused', () => {
  assert.equal(csvCell('a "quoted" cell'), '"a ""quoted"" cell"');
  for (const risky of ['=SUM(A1)', '+1', '-1', '@cmd', '\tx']) assert.ok(csvCell(risky).startsWith('"\''), risky);
  assert.equal(csvCell(null), '""');
});

test('only administrators can read, manage or export submissions; editors keep legacy collections', () => {
  for (const role of ['super_admin', 'admin']) for (const p of ['submissions.read', 'submissions.manage', 'submissions.export', 'legacy.edit']) assert.ok(allows([role], p), `${role} ${p}`);
  assert.ok(allows(['editor'], 'legacy.edit'));
  for (const p of ['submissions.read', 'submissions.manage', 'submissions.export']) { assert.ok(!allows(['editor'], p)); assert.ok(!allows(['contributor'], p)); }
  assert.ok(!allows(['contributor'], 'legacy.edit'));
});

test('legacy file editing is off in staging and production unless a developer opts in', () => {
  assert.equal(readConfig({APP_ENV: 'staging'}).legacyFileEditing, false);
  assert.equal(readConfig({APP_ENV: 'production'}).legacyFileEditing, false);
  assert.equal(readConfig({APP_ENV: 'development'}).legacyFileEditing, true);
  assert.equal(readConfig({APP_ENV: 'staging', LEGACY_FILE_EDITING: '1'}).legacyFileEditing, true);
  assert.equal(readConfig({APP_ENV: 'development', LEGACY_FILE_EDITING: '0'}).legacyFileEditing, false);
});

const response = () => ({headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; }, json(d) { this.data = d; return this; }});
const call = async (handler, method, url, extra = {}) => { const res = response(); await handler({method, url, headers: {host: 'x'}, ...extra}, res); return res; };

test('legacy handler with a Studio authorizer: no shared password, no file submissions, role-gated, read-only when asked', async () => {
  let access = 401;
  const handler = createHandler({env: {CMS_PASSWORD: 'shared-secret'}, authorize: async () => access, allowWrites: false});
  assert.equal((await call(handler, 'POST', '/api/cms/login', {body: {password: 'shared-secret'}})).statusCode, 410, 'the shared password must no longer sign anyone in');
  assert.equal((await call(handler, 'POST', '/api/cms/submit', {body: {}})).statusCode, 410);
  assert.equal((await call(handler, 'GET', '/api/cms/submissions')).statusCode, 410);
  assert.equal((await call(handler, 'GET', '/api/cms/items?collection=events')).statusCode, 401);
  access = 403;
  assert.equal((await call(handler, 'GET', '/api/cms/items?collection=events')).statusCode, 403);
  access = 200;
  assert.equal((await call(handler, 'GET', '/api/cms/items?collection=events')).statusCode, 200);
  const write = await call(handler, 'PUT', '/api/cms/items', {body: {collection: 'events', item: {title: 'X'}}});
  assert.equal(write.statusCode, 403);
  assert.match(write.data.error, /read-only/);
  assert.equal((await call(handler, 'DELETE', '/api/cms/items', {body: {collection: 'events', id: 'x'}})).statusCode, 403);
});

test('the old handler behaviour is unchanged when no authorizer is supplied (local development)', async () => {
  const handler = createHandler({env: {CMS_PASSWORD: 'pw'}});
  assert.equal((await call(handler, 'GET', '/api/cms/items?collection=events')).statusCode, 401);
  const login = await call(handler, 'POST', '/api/cms/login', {body: {password: 'pw'}});
  assert.equal(login.statusCode, 200);
});

import {likeContains} from '../server/text.js';
test('LIKE terms are escaped without backslashes', () => {
  assert.equal(likeContains('50%_off!'), '%50!%!_off!!%');
  assert.ok(!likeContains('a\\b').includes('\\\\'), 'backslashes are left alone, not doubled');
});
