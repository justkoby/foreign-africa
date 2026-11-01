import {createPool} from './db.js';
import {databaseConfigured} from './config.js';
import {migrate, migrationsDirectory} from './migrate.js';
import {provisionAdmin} from './store.js';
import {seedCatalogue} from './seed-content.js';

export async function prepareDatabase(config, env = process.env) {
  if (env.PREPARE_DATABASE !== '1') return {ran: false};
  if (!databaseConfigured(config) || !config.sessionSecret) {
    console.error('PREPARE_DATABASE=1 requires DB_HOST, DB_USER, DB_NAME, and SESSION_SECRET.');
    process.exit(1);
  }
  const pool = createPool(config);
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
