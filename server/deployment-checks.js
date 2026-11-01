import {mediaRootProblem} from './media.js';

// A readiness report the app can produce about itself, because Hostinger Business has no shell to run checks in.
// `fail` stops staging and production from starting; `warn` is shown but does not block; `info` is context.
export function deploymentChecks(config, env = process.env, {distBuilt = true} = {}) {
  const checks = [];
  const add = (id, status, label, detail) => checks.push({id, status, label, detail});
  const hosted = config.appEnv === 'staging' || config.appEnv === 'production';
  let site = null;
  try { site = new URL(config.publicSiteUrl); } catch { /* reported below */ }

  add('build', distBuilt ? 'ok' : hosted ? 'fail' : 'warn', 'Website build', distBuilt ? 'The website files (dist/index.html) exist.' : 'The website has not been built: dist/index.html is missing. In the hosting panel set the build command to "npm run build" (it needs vite, so dev dependencies must be installed) and redeploy.');
  add('environment', hosted ? 'ok' : 'warn', 'Environment', hosted ? `APP_ENV is ${config.appEnv}.` : `APP_ENV is ${config.appEnv}. Set APP_ENV=staging on the temporary domain.`);
  if (!site) add('public_url', 'fail', 'Public address', 'PUBLIC_SITE_URL is not a valid address.');
  else if (hosted && site.protocol !== 'https:') add('public_url', 'fail', 'Public address', `PUBLIC_SITE_URL (${config.publicSiteUrl}) must start with https:// so secure cookies work.`);
  else if (config.appEnv === 'staging' && /^(www\.)?foreignafrica\.org$/i.test(site.hostname)) add('public_url', 'fail', 'Public address', 'Staging must never use the production address. Set PUBLIC_SITE_URL to the temporary domain.');
  else if (site.pathname !== '/' || site.search || site.hash) add('public_url', 'fail', 'Public address', 'PUBLIC_SITE_URL must be only the origin, for example https://example.hostingersite.com (no path).');
  else add('public_url', hosted ? 'ok' : 'info', 'Public address', `Links, canonical addresses and the same-origin check use ${site.origin}.`);

  const secretLength = String(config.sessionSecret || '').length;
  add('session_secret', secretLength >= 32 ? 'ok' : hosted ? 'fail' : 'warn', 'Session secret', secretLength >= 32 ? 'SESSION_SECRET is set and long enough.' : 'SESSION_SECRET must be at least 32 random characters.');
  add('cookies', !hosted || config.cookieSecure ? 'ok' : 'fail', 'Cookies', config.cookieSecure ? 'Staff cookies are HttpOnly, SameSite=Lax and Secure, and are not tied to a domain, so moving domains simply asks staff to sign in again.' : 'Staff cookies are not Secure.');

  if (config.appEnv === 'staging') {
    const ok = Boolean(config.stagingUser && config.stagingPassword);
    add('staging_gate', ok ? (String(config.stagingPassword).length >= 12 ? 'ok' : 'warn') : 'fail', 'Access restriction', ok ? 'Every page asks for the staging user name and password.' : 'Set STAGING_USER and STAGING_PASSWORD (at least 12 characters).');
  }
  add('indexing', config.appEnv === 'production' ? 'info' : 'ok', 'Search engines', config.appEnv === 'production' ? 'Indexing is allowed (production).' : 'Every response says noindex and robots.txt disallows everything.');

  const databaseSet = Boolean(config.dbHost && config.dbUser && config.dbName);
  add('database', databaseSet ? 'ok' : hosted ? 'fail' : 'warn', 'Database', databaseSet ? `Using database ${config.dbName} with up to ${config.dbConnectionLimit} connections. It must be a dedicated CMS database, never the WordPress one (startup refuses a database that holds WordPress tables).` : 'DB_HOST, DB_USER and DB_NAME are not all set.');
  add('migration_account', 'info', 'Database accounts', config.dbMigrateUser ? 'A separate migration account is configured; the site runs with the runtime account.' : 'One account is used for migrations and the running site. Add DB_MIGRATE_USER to separate them if hPanel allows it.');

  if (!config.mediaRoot) add('media', 'warn', 'Uploads', 'MEDIA_ROOT is not set, so uploads are switched off. Set it only after the storage test in docs/cms/HOSTINGER_STAGING_SETUP.md passes.');
  else if (mediaRootProblem(config.mediaRoot)) add('media', 'fail', 'Uploads', mediaRootProblem(config.mediaRoot));
  else add('media', 'ok', 'Uploads', `Files are stored in ${config.mediaRoot}, outside the deployment folder.`);

  add('cron', config.cronSecret ? 'ok' : 'warn', 'Scheduled publishing', config.cronSecret ? 'CRON_SECRET is set; an external scheduler can call /api/cron/publish.' : 'No CRON_SECRET. Scheduled items still go live when the site is visited, but not on a timer.');
  if (env.BOOTSTRAP_ADMIN_PASSWORD) add('bootstrap', 'warn', 'First administrator', 'BOOTSTRAP_ADMIN_PASSWORD is still set. Remove it from the environment after the first successful start.');
  if (env.CMS_PASSWORD) add('legacy_password', 'warn', 'Old editor password', 'CMS_PASSWORD is set but unused on this server. Remove it.');
  return checks;
}

export const blockingChecks = checks => checks.filter(check => check.status === 'fail');
