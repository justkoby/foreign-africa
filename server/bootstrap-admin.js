import {createPool} from './db.js';
import {databaseConfigured, readConfig} from './config.js';
import {provisionAdmin} from './store.js';

const config = readConfig();
if (!databaseConfigured(config) || !config.sessionSecret) {
  console.error('Set DB_HOST, DB_USER, DB_NAME, and SESSION_SECRET before creating the first administrator.');
  process.exit(1);
}
const email = process.env.BOOTSTRAP_ADMIN_EMAIL || '';
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || '';
const name = process.env.BOOTSTRAP_ADMIN_NAME || 'Administrator';
if (!email || !password) {
  console.error('Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD in the environment for this command only. Do not commit them.');
  process.exit(1);
}
const pool = createPool(config);
try {
  const user = await provisionAdmin({pool, config, clock: () => Date.now(), email, name, password});
  console.log(`Super administrator created for ${user.email}.`);
} catch (error) {
  console.error(error.status ? error.message : 'The account could not be created.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
