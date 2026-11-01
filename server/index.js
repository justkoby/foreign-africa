import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPool} from './db.js';
import {databaseConfigured, readConfig} from './config.js';
import {createSite} from './site.js';
import {prepareDatabase} from './prepare.js';
import {blockingChecks, deploymentChecks} from './deployment-checks.js';

async function start() {
  const config = readConfig();
  const checks = deploymentChecks(config);
  for (const check of checks) if (check.status === 'fail' || check.status === 'warn') console.log(`[${check.status}] ${check.label}: ${check.detail}`);
  // Staging and production refuse to start with an unsafe setup; development only warns.
  if ((config.appEnv === 'staging' || config.appEnv === 'production') && blockingChecks(checks).length) {
    console.error('Not starting: fix the [fail] items above in the hosting environment variables.');
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
}

start().catch(error => {
  console.error(error.status ? error.message : 'The server failed to start.');
  process.exit(1);
});
