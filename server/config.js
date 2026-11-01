export function readConfig(env = process.env) {
  const appEnv = env.APP_ENV || 'development';
  return {
    dbHost: env.DB_HOST || '',
    dbPort: Number(env.DB_PORT || 3306),
    dbUser: env.DB_USER || '',
    dbPassword: env.DB_PASSWORD || '',
    dbName: env.DB_NAME || '',
    sessionSecret: env.SESSION_SECRET || '',
    appEnv,
    publicSiteUrl: String(env.PUBLIC_SITE_URL || 'http://localhost:5173').replace(/\/$/, ''),
    mediaRoot: env.MEDIA_ROOT || '',
    cookieSecure: env.COOKIE_SECURE === '1' || appEnv === 'production' || appEnv === 'staging',
    stagingUser: env.STAGING_USER || '',
    stagingPassword: env.STAGING_PASSWORD || '',
    passwordCost: Number(env.PASSWORD_COST || (appEnv === 'test' ? 4 : 12)),
    sessionDays: 7,
  };
}

export function databaseConfigured(config) {
  return Boolean(config.dbHost && config.dbUser && config.dbName);
}
