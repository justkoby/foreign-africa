import {createPool} from './db.js';
import {databaseConfigured, readConfig} from './config.js';
import {promoteScheduled} from './store.js';

const config = readConfig();
if (!databaseConfigured(config)) {
  console.error('Set DB_HOST, DB_USER, and DB_NAME before promoting scheduled pages.');
  process.exit(1);
}
const pool = createPool(config);
try {
  const promoted = await promoteScheduled(pool, () => Date.now());
  console.log(`Promoted ${promoted} scheduled page${promoted === 1 ? '' : 's'}.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
