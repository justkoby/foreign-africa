import {readdirSync, readFileSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPool} from './db.js';
import {databaseConfigured, readConfig} from './config.js';

const ledger = `CREATE TABLE IF NOT EXISTS schema_migrations (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  applied_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

export function statementsFrom(sql) {
  return sql.split(/\r?\n/)
    .filter(line => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map(statement => statement.trim())
    .filter(Boolean);
}

export function migrationFiles(directory) {
  const names = readdirSync(directory).filter(name => /^\d+_.+\.sql$/.test(name)).sort();
  const prefixes = names.map(name => name.match(/^\d+/)[0]);
  if (new Set(prefixes).size !== prefixes.length) throw new Error('Two migration files use the same number.');
  return names;
}

export async function migrate({pool, directory}) {
  await pool.query(ledger);
  const [rows] = await pool.query('SELECT id FROM schema_migrations');
  const applied = new Set(rows.map(row => row.id));
  const ran = [];
  for (const name of migrationFiles(directory)) {
    const id = name.replace(/\.sql$/, '');
    if (applied.has(id)) continue;
    const statements = statementsFrom(readFileSync(join(directory, name), 'utf8'));
    if (statements.some(statement => /^\s*drop\s+database\b/i.test(statement))) {
      throw new Error(`Migration ${id} tried to drop a database.`);
    }
    const connection = await pool.getConnection();
    try {
      for (const statement of statements) await connection.query(statement);
      await connection.query('INSERT INTO schema_migrations (id, applied_at) VALUES (?, UTC_TIMESTAMP(3))', [id]);
      ran.push(id);
    } catch (error) {
      const failure = new Error(`Migration ${id} failed: ${error.message}`);
      failure.migration = id;
      failure.cause = error;
      throw failure;
    } finally {
      connection.release();
    }
  }
  return ran;
}

export const migrationsDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const config = readConfig();
  if (!databaseConfigured(config)) {
    console.error('Set DB_HOST, DB_USER, and DB_NAME before migrating.');
    process.exit(1);
  }
  const pool = createPool(config);
  try {
    const ran = await migrate({pool, directory: migrationsDirectory});
    console.log(ran.length ? `Applied ${ran.join(', ')}` : 'Migrations are already up to date.');
  } catch (error) {
    console.error(error.message);
    console.error('This migration was not recorded. MySQL commits each CREATE TABLE on its own, so a failed file may have left earlier tables in place. Repair the schema, then run the command again. Applied files are skipped.');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
