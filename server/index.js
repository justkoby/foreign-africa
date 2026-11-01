import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPool} from './db.js';
import {databaseConfigured, readConfig} from './config.js';
import {createSite} from './site.js';
import {prepareDatabase} from './prepare.js';
import {blockingChecks, deploymentChecks} from './deployment-checks.js';
import {inspectDatabase} from './db-inspect.js';
import {buildFreshness} from './build-stamp.js';
import {createBoot, describeStartupError, listenTarget} from './boot.js';

// Bind the port first. A host that sees the app exit before it listens can only say "503"; a listening app can say why.
const boot = createBoot();
let current = boot.handler;
const server = createServer((request, response) => current(request, response));
const target = listenTarget(process.env.PORT);
server.listen(target, () => console.log(`Foreign Africa is listening on ${target}.`));
server.on('error', error => {
  console.error(`Could not listen on ${target}: ${error.code || error.name}`);
  process.exit(1);
});
process.on('unhandledRejection', reason => console.error(`Unhandled problem: ${reason?.code || reason?.name || 'unknown'}`));

function fail(phase, problems, config) {
  boot.state.phase = phase;
  boot.state.problems = problems;
  for (const problem of problems) console.error(`[fail] ${problem.label}: ${problem.detail}`);
  // Production never serves a diagnostic page: it exits, so the host's own error handling applies.
  if (config.appEnv === 'production') {
    console.error('Not starting.');
    process.exit(1);
  }
  console.error('The server is running but not ready. Every page returns 503 with the reason; fix the setting and redeploy.');
}

async function start() {
  const config = readConfig();
  const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const checks = deploymentChecks(config, process.env, {distBuilt: existsSync(join(dist, 'index.html')), distFreshness: buildFreshness(join(dist, '..'))});
  for (const check of checks) if (check.status === 'fail' || check.status === 'warn') console.log(`[${check.status}] ${check.label}: ${check.detail}`);
  const hosted = config.appEnv === 'staging' || config.appEnv === 'production';
  const blocking = blockingChecks(checks);
  if (hosted && blocking.length) return fail('configuration', blocking.map(({label, detail}) => ({label, detail})), config);
  if (process.env.PREPARE_DATABASE === 'check') {
    // Read-only inspection: reports what initialisation would do, and changes nothing.
    const report = await inspectDatabase(config);
    boot.state.phase = 'check';
    boot.state.problems = report;
    for (const item of report) console.log(`[check:${item.status}] ${item.label}: ${item.detail}`);
    console.log('Database check finished. Nothing was changed. The website is not started in check mode.');
    return;
  }
  try {
    await prepareDatabase(config);
  } catch (error) {
    const {detail} = describeStartupError(error);
    return fail('database', [{label: 'Database', detail}], config);
  }
  const pool = databaseConfigured(config) ? createPool(config) : null;
  current = createSite({config, pool, dist});
  boot.state.phase = 'running';
  console.log('Foreign Africa is ready.');
}

start().catch(error => fail('startup', [{label: 'Startup', detail: describeStartupError(error).detail}], {appEnv: process.env.APP_ENV}));
