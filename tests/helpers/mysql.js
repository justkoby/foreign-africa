// Disposable MySQL for integration tests. Never touches an existing database.
// Prefers a system mysqld (set TEST_MYSQL_BIN, or it is found on PATH / /usr/sbin);
// otherwise falls back to mysql-memory-server, which downloads MySQL on first use.
import {spawn, spawnSync} from 'node:child_process';
import {existsSync, mkdtempSync, rmSync} from 'node:fs';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import mysql from 'mysql2/promise';

function findMysqld() {
  for (const candidate of [process.env.TEST_MYSQL_BIN, '/usr/sbin/mysqld', '/usr/local/mysql/bin/mysqld', '/opt/homebrew/bin/mysqld']) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return '';
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => { const {port} = server.address(); server.close(() => resolve(port)); });
    server.on('error', reject);
  });
}

async function startSystemMysql(bin) {
  const dir = mkdtempSync(join(tmpdir(), 'fa-mysql-'));
  const data = join(dir, 'data');
  const run = ['--no-defaults', `--datadir=${data}`, '--user=root'];
  const init = spawnSync(bin, [...run, '--initialize-insecure', `--basedir=/usr`], {encoding: 'utf8'});
  if (init.status !== 0) throw new Error(`mysqld --initialize failed: ${(init.stderr || '').slice(-300)}`);
  const port = await freePort();
  const child = spawn(bin, [...run, `--port=${port}`, '--bind-address=127.0.0.1', `--socket=${join(dir, 'mysql.sock')}`, `--mysqlx=OFF`, `--pid-file=${join(dir, 'mysql.pid')}`], {stdio: 'ignore'});
  const stop = async () => { child.kill('SIGTERM'); await new Promise(resolve => { child.once('exit', resolve); setTimeout(resolve, 5000); }); rmSync(dir, {recursive: true, force: true}); };
  let admin;
  for (let attempt = 0; attempt < 60 && !admin; attempt += 1) {
    try { admin = await mysql.createConnection({host: '127.0.0.1', port, user: 'root'}); } catch { await new Promise(resolve => setTimeout(resolve, 500)); }
  }
  if (!admin) { await stop(); throw new Error('mysqld did not accept connections.'); }
  const dbName = `fa_test_${Date.now().toString(36)}`;
  await admin.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.end();
  return {port, username: 'root', dbName, stop, flavour: 'system mysqld'};
}

export async function createDisposableMysql() {
  const bin = findMysqld();
  if (bin) return startSystemMysql(bin);
  const {createDB} = await import('mysql-memory-server');
  const database = await createDB({version: '8.4.x'});
  return {port: database.port, username: database.username, dbName: database.dbName, stop: () => database.stop(), flavour: 'mysql-memory-server'};
}
