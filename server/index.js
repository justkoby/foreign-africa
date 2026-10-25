import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPool} from './db.js';
import {databaseConfigured, readConfig} from './config.js';
import {createSite} from './site.js';
import {prepareDatabase} from './prepare.js';

const config = readConfig();
if (config.appEnv === 'staging' && (!config.stagingUser || !config.stagingPassword)) {
  console.error('Staging requires STAGING_USER and STAGING_PASSWORD.');
  process.exit(1);
}
try {
  await prepareDatabase(config);
} catch (error) {
  console.error(error.status ? error.message : 'Database preparation failed.');
  process.exit(1);
}
const pool = databaseConfigured(config) ? createPool(config) : null;
const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const port = Number(process.env.PORT || 3000);
createSite({config, pool, dist}).listen(port, () => {
  console.log(`Foreign Africa is listening on ${port}.`);
});
