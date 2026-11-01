import test from 'node:test';
import assert from 'node:assert/strict';
import {createDisposableMysql} from './helpers/mysql.js';
import {createPool} from '../server/db.js';
import {migrate, migrationsDirectory} from '../server/migrate.js';
import {importTables} from '../server/backup.js';
import {wordpressTables} from '../server/database-guard.js';

test('wordpress table names are recognised whatever the prefix', () => {
  assert.deepEqual(wordpressTables(['wp_posts', 'x9_options', 'users', 'content_items', 'foo_usermeta']), ['wp_posts', 'x9_options', 'foo_usermeta']);
  assert.deepEqual(wordpressTables(['users', 'content_items', 'settings', 'submissions']), []);
});

test('migrations and restores refuse a database that holds WordPress or foreign tables, and change nothing', {timeout: 300000}, async t => {
  let database;
  try { database = await createDisposableMysql(); } catch (error) { return t.skip(`Database could not be started: ${error.message}`); }
  const connect = name => createPool({dbHost: '127.0.0.1', dbPort: database.port, dbUser: database.username, dbPassword: '', dbName: name});
  const admin = connect(database.dbName);
  t.after(async () => { await admin.end(); await database.stop(); });
  const tables = async pool => (await pool.query('SELECT TABLE_NAME AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY 1'))[0].map(r => r.n);

  await admin.query('CREATE DATABASE wp_like CHARACTER SET utf8mb4');
  const wp = connect('wp_like');
  t.after(() => wp.end());
  await wp.query('CREATE TABLE wp_posts (ID BIGINT PRIMARY KEY, post_title TEXT)');
  await wp.query('CREATE TABLE wp_options (option_id BIGINT PRIMARY KEY)');
  await wp.query('CREATE TABLE users (id INT PRIMARY KEY, secret VARCHAR(20))');
  await wp.query("INSERT INTO users VALUES (1, 'keep-me')");
  const before = await tables(wp);
  await assert.rejects(() => migrate({pool: wp, directory: migrationsDirectory}), /WordPress tables/);
  await assert.rejects(() => importTables(wp, {}), /WordPress tables/);
  assert.deepEqual(await tables(wp), before, 'no table was created, altered or dropped');
  const [[row]] = await wp.query('SELECT secret FROM users WHERE id = 1');
  assert.equal(row.secret, 'keep-me');

  await admin.query('CREATE DATABASE other_app CHARACTER SET utf8mb4');
  const other = connect('other_app');
  t.after(() => other.end());
  await other.query('CREATE TABLE users (id INT PRIMARY KEY)');
  await assert.rejects(() => migrate({pool: other, directory: migrationsDirectory}), /not a Foreign Africa CMS database/);
  assert.deepEqual(await tables(other), ['users']);

  assert.equal((await migrate({pool: admin, directory: migrationsDirectory})).length, 5, 'an empty database is accepted');
  assert.deepEqual(await migrate({pool: admin, directory: migrationsDirectory}), [], 'a CMS database re-runs safely');
});
