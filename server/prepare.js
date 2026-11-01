import bcrypt from 'bcryptjs';
import { createPool } from './db.js';
import { databaseConfigured } from './config.js';
import { migrate, migrationsDirectory } from './migrate.js';
import { provisionAdmin } from './store.js';
import { seedCatalogue } from './seed-content.js';
import { sqlTime } from './text.js';

export async function prepareDatabase(config, env = process.env) {
  if (!databaseConfigured(config) || !config.sessionSecret) {
    return { ran: false };
  }
  const pool = createPool(config);
  try {
    const ran = await migrate({ pool, directory: migrationsDirectory });
    if (ran.length) console.log(`Applied ${ran.join(', ')}.`);
    const email = (env.BOOTSTRAP_ADMIN_EMAIL || 'info@foreignafrica.org').trim().toLowerCase();
    const password = env.BOOTSTRAP_ADMIN_PASSWORD || 'ChangeMeAdmin2026!';
    if (email && password) {
      const [existing] = await pool.execute('SELECT id, password_hash FROM users WHERE email = ? AND deleted_at IS NULL', [email]);
      if (!existing[0]) {
        try {
          const user = await provisionAdmin({ pool, config, clock: () => Date.now(), email, name: env.BOOTSTRAP_ADMIN_NAME || 'Administrator', password });
          console.log(`Super administrator created for ${user.email}.`);
        } catch (error) {
          if (error.status !== 409) console.warn('Bootstrap admin error:', error.message);
        }
      } else {
        const matches = await bcrypt.compare(password, existing[0].password_hash);
        if (!matches) {
          const hash = await bcrypt.hash(password, config.passwordCost);
          await pool.execute('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hash, sqlTime(Date.now()), existing[0].id]);
          console.log(`Administrator password synchronized for ${email}.`);
        }
      }
    }
    const [users] = await pool.execute("SELECT users.id FROM users JOIN user_roles ON user_roles.user_id = users.id JOIN roles ON roles.id = user_roles.role_id WHERE roles.role_key = 'super_admin' AND users.deleted_at IS NULL ORDER BY users.id LIMIT 1");
    if (!users[0]) {
      return { ran: true, seeded: false };
    }
    const report = await seedCatalogue({ pool, clock: () => Date.now(), actor: { id: users[0].id, roles: ['super_admin'] } });
    if (report.inserted?.length) {
      console.log(`Seed finished. Inserted ${report.inserted.length}, already present ${report.existing.length}, blocked ${report.blocked.length}.`);
    }
    return { ran: true, seeded: true, report };
  } finally {
    await pool.end();
  }
}
