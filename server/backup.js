import {sqlTime} from './text.js';

const insertOrder = ['users', 'user_roles', 'media_assets', 'terms', 'content_items', 'content_revisions', 'content_terms', 'forms', 'submissions', 'submission_notes', 'activity_logs'];
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
  await pool.query('SET FOREIGN_KEY_CHECKS=0');
  for (const table of deleteOrder) await pool.query(`DELETE FROM \`${table}\``);
  for (const table of insertOrder) {
    for (const row of dump[table] ?? []) {
      const keys = Object.keys(row);
      await pool.query(`INSERT INTO \`${table}\` (${keys.map(key => `\`${key}\``).join(',')}) VALUES (${keys.map(() => '?').join(',')})`, keys.map(key => cell(row[key])));
    }
  }
  await pool.query('SET FOREIGN_KEY_CHECKS=1');
}
