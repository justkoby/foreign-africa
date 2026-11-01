export function readConfig(env = process.env) {
  const appEnv = env.APP_ENV || 'development';
  return {
    dbHost: env.DB_HOST || '',
    dbPort: Number(env.DB_PORT || 3306),
    dbUser: env.DB_USER || '',
    dbPassword: env.DB_PASSWORD || '',
    dbName: env.DB_NAME || '',
    // Pool size per process. Shared hosting often caps connections per database user; keep this at or below that cap.
    dbConnectionLimit: Math.min(Math.max(Math.trunc(Number(env.DB_CONNECTION_LIMIT)) || 5, 1), 25),
    // Optional second account with CREATE/ALTER/INDEX/REFERENCES, used only by startup preparation and `npm run migrate`.
    // When set, the running site can use an account that has only SELECT, INSERT, UPDATE and DELETE.
    dbMigrateUser: env.DB_MIGRATE_USER || '',
    dbMigratePassword: env.DB_MIGRATE_PASSWORD || '',
    // Shared secret for POST /api/cron/publish. Must be at least 32 characters, or the endpoint stays disabled.
    // Extra hosts editors may link to from the homepage and hero (comma separated). foreignafrica.org and the site's own host are always allowed.
    ctaExtraHosts: env.CTA_EXTRA_HOSTS || '',
    cronSecret: String(env.CRON_SECRET || '').length >= 32 ? env.CRON_SECRET : '',
    sessionSecret: env.SESSION_SECRET || '',
    appEnv,
    publicSiteUrl: String(env.PUBLIC_SITE_URL || 'http://localhost:5173').replace(/\/$/, ''),
    mediaRoot: env.MEDIA_ROOT || '',
    cookieSecure: env.COOKIE_SECURE === '1' || appEnv === 'production' || appEnv === 'staging',
    stagingUser: env.STAGING_USER || '',
    stagingPassword: env.STAGING_PASSWORD || '',
    passwordCost: Number(env.PASSWORD_COST || (appEnv === 'test' ? 4 : 12)),
    sessionDays: 7,
    // The legacy file collections (events, people, engage, forms) are bundled into the public site at build time
    // and live in the deploy tree. Writing them is a development workflow; staging and production refuse it unless
    // a developer opts in with LEGACY_FILE_EDITING=1.
    legacyFileEditing: env.LEGACY_FILE_EDITING === '1' || (env.LEGACY_FILE_EDITING !== '0' && appEnv !== 'staging' && appEnv !== 'production'),
  };
}

export function databaseConfigured(config) {
  return Boolean(config.dbHost && config.dbUser && config.dbName);
}
