import {createPool} from './db.js';
import {databaseConfigured} from './config.js';
import {migrate, migrationConfig, migrationsDirectory} from './migrate.js';
import {provisionAdmin} from './store.js';
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
  // Startup preparation (migrations, first admin, seed) uses the migration account when one is configured.
  const pool = createPool(migrationConfig(config));
  try {
    const ran = await migrate({pool, directory: migrationsDirectory});
    console.log(ran.length ? `Applied ${ran.join(', ')}.` : 'Migrations are already up to date.');
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
