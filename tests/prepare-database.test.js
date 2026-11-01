import test from 'node:test';
import assert from 'node:assert/strict';
import {createDB} from 'mysql-memory-server';
import {prepareDatabase} from '../server/prepare.js';

test('startup preparation migrates, bootstraps once, and seeds without duplicates', {timeout: 300000}, async (t) => {
  let database;
  try {
    database = await createDB({version: '8.4.x'});
  } catch (error) {
    return t.skip(`MySQL 8 could not be started: ${error.message}`);
  }
  const config = {
    dbHost: '127.0.0.1', dbPort: database.port, dbUser: database.username, dbPassword: '', dbName: database.dbName,
    sessionSecret: 'test-secret', appEnv: 'test', passwordCost: 4, publicSiteUrl: 'https://preview.foreignafrica.org',
    mediaRoot: '', cookieSecure: false, stagingUser: '', stagingPassword: '',
  };
  const env = {PREPARE_DATABASE: '1', BOOTSTRAP_ADMIN_EMAIL: 'ada@foreignafrica.org', BOOTSTRAP_ADMIN_PASSWORD: 'correct-horse-battery', BOOTSTRAP_ADMIN_NAME: 'Ada'};
  t.after(async () => { await database.stop(); });
  const first = await prepareDatabase(config, env);
  const second = await prepareDatabase(config, env);
  assert.equal(first.seeded, true);
  assert.equal(first.report.inserted.length, 17);
  assert.equal(first.report.blocked.length, 0);
  assert.equal(second.report.inserted.length, 0);
  assert.equal(second.report.existing.length, 17);
  const skipped = await prepareDatabase(config, {PREPARE_DATABASE: '0'});
  assert.equal(skipped.ran, false);
});
