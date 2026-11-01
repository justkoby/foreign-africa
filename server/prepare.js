import {createPool} from './db.js';
import {databaseConfigured} from './config.js';
import {migrate, migrationConfig, migrationsDirectory} from './migrate.js';
import {provisionAdmin, userCount} from './store.js';
import {seedCatalogue} from './seed-content.js';
import {createCms, projectRoot} from './cms-service.js';
import {importLegacySubmissions} from './submissions.js';
import {join} from 'node:path';
import bcrypt from 'bcryptjs';
import {sqlTime} from './text.js';

export async function prepareDatabase(config, env = process.env) {
  // Startup preparation runs whenever the database is configured (set PREPARE_DATABASE=0 to switch it off).
  if (env.PREPARE_DATABASE === '0') return {ran: false};
  if (!databaseConfigured(config) || !config.sessionSecret) {
    if (env.PREPARE_DATABASE === '1') throw Object.assign(new Error('PREPARE_DATABASE=1 requires DB_HOST, DB_USER, DB_NAME and SESSION_SECRET to be set.'), {status: 400});
    return {ran: false};
  }
  // Optional second typing of the target database name. When it is set it must match, so an inherited DB_NAME cannot be initialised by accident.
  if (env.PREPARE_DATABASE_CONFIRM && env.PREPARE_DATABASE_CONFIRM !== config.dbName) {
    throw Object.assign(new Error('PREPARE_DATABASE_CONFIRM does not match DB_NAME, so initialisation was refused. Nothing was changed.'), {status: 400});
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
      // Never invent credentials: without them nobody can sign in, and the site says so instead of using a default password.
      console.warn('The tables are ready, but no administrator exists and BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD are not set, so nobody can sign in yet. Set both (password 12+ characters) and restart.');
    }
    const email = (env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
    const password = env.BOOTSTRAP_ADMIN_PASSWORD || '';
    if (email && password) {
      const [existing] = await pool.execute('SELECT id, password_hash FROM users WHERE email = ? AND deleted_at IS NULL', [email]);
      if (!existing[0]) {
        try {
          const user = await provisionAdmin({pool, config, clock: () => Date.now(), email, name: env.BOOTSTRAP_ADMIN_NAME || 'Administrator', password});
          console.log(`Super administrator created for ${user.email}.`);
        } catch (error) {
          if (error.status === 409) console.log('An administrator already exists. Bootstrap was skipped.');
          else throw error;
        }
      } else if (!(await bcrypt.compare(password, existing[0].password_hash))) {
        // Keeps the configured bootstrap password authoritative. Remove BOOTSTRAP_ADMIN_PASSWORD after first sign-in to stop this.
        await pool.execute('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [await bcrypt.hash(password, config.passwordCost), sqlTime(Date.now()), existing[0].id]);
        console.log(`Administrator password synchronized for ${email}.`);
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
