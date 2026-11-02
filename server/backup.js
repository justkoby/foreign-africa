import {sqlTime} from './text.js';
import {assertCmsDatabase} from './database-guard.js';

const insertOrder = ['users', 'user_roles', 'media_assets', 'terms', 'content_items', 'content_revisions', 'content_terms', 'events', 'event_revisions', 'event_terms', 'forms', 'submissions', 'submission_notes', 'activity_logs'];
const deleteOrder = [...insertOrder].reverse();

function cell(value) {
  if (value instanceof Date) return sqlTime(value.getTime());
  // A dump written to a file and read back carries timestamps as ISO strings.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value)) return sqlTime(Date.parse(value));
  if (value && typeof value === 'object' && !Buffer.isBuffer(value)) return JSON.stringify(value);
  return value ?? null;
}

export async function exportTables(pool) {
  const dump = {};
  for (const table of insertOrder) {
    const [rows] = await pool.query(`SELECT * FROM \`${table}\``);
    dump[table] = rows;
  }
  return dump;
}

export async function importTables(pool, dump) {
  const names = await assertCmsDatabase(pool, {action: 'restore'});
  if (!names.includes('schema_migrations')) throw new Error('Refusing to restore into a database without Foreign Africa tables. Run the migrations first.');
  // One dedicated connection: FOREIGN_KEY_CHECKS is per connection, and a transaction means a failed restore
  // rolls back instead of leaving emptied tables. (Only DML here; DDL would commit implicitly.)
  const connection = await pool.getConnection();
  try {
    await connection.query('SET FOREIGN_KEY_CHECKS=0');
    await connection.beginTransaction();
    try {
      for (const table of deleteOrder) await connection.query(`DELETE FROM \`${table}\``);
      for (const table of insertOrder) {
        for (const row of dump[table] ?? []) {
          const keys = Object.keys(row);
          await connection.execute(`INSERT INTO \`${table}\` (${keys.map(key => `\`${key}\``).join(',')}) VALUES (${keys.map(() => '?').join(',')})`, keys.map(key => cell(row[key])));
        }
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    await connection.query('SET FOREIGN_KEY_CHECKS=1').catch(() => {});
    connection.release();
  }
}
