import {createPool} from './db.js';
import {databaseConfigured} from './config.js';
import {migrate, migrationConfig, migrationsDirectory} from './migrate.js';
import {provisionAdmin, userCount} from './store.js';
import {seedCatalogue} from './seed-content.js';
import {createCms, projectRoot} from './cms-service.js';
import {importLegacySubmissions} from './submissions.js';
import {join} from 'node:path';

export async function prepareDatabase(config, env = process.env) {
  if (env.PREPARE_DATABASE !== '1') return {ran: false};
  if (!databaseConfigured(config) || !config.sessionSecret) {
    // Thrown, not process.exit: the caller reports it. An exit before listening shows the host only a bare 503.
    throw Object.assign(new Error('PREPARE_DATABASE=1 requires DB_HOST, DB_USER, DB_NAME and SESSION_SECRET to be set.'), {status: 400});
  }
  // Initialisation only proceeds when the operator has typed the target database name a second time. A mistyped or
  // inherited DB_NAME therefore cannot be initialised by accident.
  if (env.PREPARE_DATABASE_CONFIRM !== config.dbName) {
    throw Object.assign(new Error('PREPARE_DATABASE=1 also needs PREPARE_DATABASE_CONFIRM set to the exact name of the dedicated CMS database (the same text as DB_NAME). This stops initialisation running against the wrong database. Nothing was changed.'), {status: 400});
  }
  const wantsAdmin = Boolean(env.BOOTSTRAP_ADMIN_EMAIL || env.BOOTSTRAP_ADMIN_PASSWORD);
  if (wantsAdmin && !(env.BOOTSTRAP_ADMIN_EMAIL && env.BOOTSTRAP_ADMIN_PASSWORD)) {
    throw Object.assign(new Error('Set both BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD, or neither. Nothing was changed.'), {status: 400});
  }
  if (wantsAdmin) {
    // Checked before any table is created, so a weak password or a typo'd e-mail never leaves a half-initialised database.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.BOOTSTRAP_ADMIN_EMAIL)) throw Object.assign(new Error('BOOTSTRAP_ADMIN_EMAIL is not a valid e-mail address. Nothing was changed.'), {status: 400});
    if (env.BOOTSTRAP_ADMIN_PASSWORD.length < 12) throw Object.assign(new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters. Nothing was changed.'), {status: 400});
  }
  // Startup preparation (migrations, first admin, seed) uses the migration account when one is configured.
  const pool = createPool(migrationConfig(config));
  try {
    const ran = await migrate({pool, directory: migrationsDirectory});
    console.log(ran.length ? `Applied ${ran.join(', ')}.` : 'Migrations are already up to date.');
    if (!wantsAdmin && await userCount(pool) === 0) {
      throw Object.assign(new Error('The tables are ready, but no administrator exists and BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD are not set, so nobody could sign in. Set them (password 12+ characters) and restart. The tables created so far are kept.'), {status: 400});
    }
    const email = env.BOOTSTRAP_ADMIN_EMAIL || '';
    const password = env.BOOTSTRAP_ADMIN_PASSWORD || '';
    if (email && password) {
      try {
        const user = await provisionAdmin({pool, config, clock: () => Date.now(), email, name: env.BOOTSTRAP_ADMIN_NAME || 'Administrator', password});
        console.log(`Super administrator created for ${user.email}.`);
      } catch (error) {
        if (error.status === 409) console.log('An administrator already exists. Bootstrap was skipped.');
        else throw error;
      }
    }
    const moved = await importLegacySubmissions({pool, clock: () => Date.now(), secret: config.sessionSecret, file: join(projectRoot, 'data', 'cms', 'submissions.json'), forms: createCms({env: {}}).list('forms') ?? []});
    if (moved.imported || moved.skipped || moved.missingForm) console.log(`Legacy submissions: imported ${moved.imported}, already present ${moved.skipped}, unknown form ${moved.missingForm}.`);
    const [users] = await pool.execute("SELECT users.id FROM users JOIN user_roles ON user_roles.user_id = users.id JOIN roles ON roles.id = user_roles.role_id WHERE roles.role_key = 'super_admin' AND users.deleted_at IS NULL ORDER BY users.id LIMIT 1");
    if (!users[0]) {
      console.log('Seed skipped until a super administrator exists.');
      return {ran: true, seeded: false};
    }
    const report = await seedCatalogue({pool, clock: () => Date.now(), actor: {id: users[0].id, roles: ['super_admin']}});
    console.log(`Seed finished. Inserted ${report.inserted.length}, already present ${report.existing.length}, blocked ${report.blocked.length}.`);
    return {ran: true, seeded: true, report};
  } finally {
    await pool.end();
  }
}
