import {fail} from './errors.js';

// The CMS must live in its own database. Migrations, seeds and restores refuse to run against a database that
// holds WordPress (or any other application's) tables, so a wrong DB_NAME cannot damage the live website.
const wordpressTable = /_(posts|postmeta|options|usermeta|commentmeta|termmeta|term_taxonomy|term_relationships)$/i;

export function wordpressTables(names) {
  return names.filter(name => wordpressTable.test(name));
}

export async function assertCmsDatabase(pool, {action = 'run'} = {}) {
  const [rows] = await pool.query('SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()');
  const names = rows.map(row => row.name ?? row.TABLE_NAME);
  const wordpress = wordpressTables(names);
  if (wordpress.length) {
    throw fail(409, `Refusing to ${action}: this database contains WordPress tables (${wordpress.slice(0, 3).join(', ')}). The Foreign Africa CMS needs its own empty database. Nothing was changed.`);
  }
  if (names.length && !names.includes('schema_migrations')) {
    throw fail(409, `Refusing to ${action}: this database already has ${names.length} table${names.length === 1 ? '' : 's'} (for example ${names[0]}) and is not a Foreign Africa CMS database. Use a new empty database. Nothing was changed.`);
  }
  return names;
}
