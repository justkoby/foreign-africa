import {createPool} from './db.js';
import {migrationConfig, migrationFiles, migrationsDirectory} from './migrate.js';
import {wordpressTables} from './database-guard.js';
import {describeStartupError} from './boot.js';

// A strictly READ-ONLY look at the configured database, run with PREPARE_DATABASE=check. It issues only SELECT and SHOW
// statements, so it can be run against an unverified database to see what initialisation WOULD do, changing nothing.
// The database name is masked in the output and no user name, host or password is ever included.
export const maskName = name => (String(name).length <= 12 ? `${String(name).slice(0, 2)}…` : `${String(name).slice(0, 4)}…${String(name).slice(-7)}`);

// Reads the grants of the connected account that apply to this database. `ON *.*` grants apply to every database.
export function analyseGrants(lines, database) {
  const parsed = lines.map(line => {
    const match = /^GRANT (.+?) ON (.+?) TO /i.exec(line);
    return match ? {privileges: match[1].toUpperCase(), on: match[2].replace(/`/g, '').replace(/\\/g, '')} : null;
  }).filter(Boolean);
  const here = parsed.filter(grant => grant.on === `${database}.*`);
  const global = parsed.filter(grant => grant.on === '*.*' && !/^USAGE$/.test(grant.privileges.trim()));
  const has = (privilege, list) => list.some(grant => grant.privileges.includes('ALL PRIVILEGES') || new RegExp(`\\b${privilege}\\b`).test(grant.privileges));
  const own = [...here, ...global];
  return {
    create: has('CREATE', own), alter: has('ALTER', own), insert: has('INSERT', own), select: has('SELECT', own), references: has('REFERENCES', own),
    allPrivilegesHere: here.some(grant => grant.privileges.includes('ALL PRIVILEGES')),
    globalPrivileges: global.length > 0,
    anyGrantHere: own.length > 0,
  };
}

export async function inspectDatabase(config, env = process.env) {
  const findings = [];
  const add = (id, status, label, detail) => findings.push({id, status, label, detail});
  const usingMigrationAccount = Boolean(config.dbMigrateUser);
  let pool;
  try {
    pool = createPool({...migrationConfig(config), dbConnectionLimit: 1});
    const [[info]] = await pool.query('SELECT VERSION() AS version, DATABASE() AS name, @@character_set_database AS charset, @@collation_database AS collation');
    add('connection', 'ok', 'Connection', `Connected using the ${usingMigrationAccount ? 'migration' : 'main'} account.`);
    const mariadb = /mariadb/i.test(info.version);
    const major = Number(String(info.version).match(/\d+/)?.[0] ?? 0);
    const supported = mariadb ? major >= 10 : major >= 8;
    add('engine', supported ? 'ok' : 'warn', 'Database engine', `${mariadb ? 'MariaDB' : 'MySQL'} ${String(info.version).split('-')[0]}${supported ? ' (supported; tested on MariaDB 11.8 and MySQL 8.0).' : ' (not a tested version).'}`);
    add('target', 'ok', 'Target database', `${maskName(info.name)} (character set ${info.charset}).`);

    const [tables] = await pool.query('SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()');
    const names = tables.map(row => row.name ?? row.TABLE_NAME);
    const wordpress = wordpressTables(names);
    const ours = names.includes('schema_migrations');
    let state = 'empty';
    if (wordpress.length) { state = 'wordpress'; add('contents', 'fail', 'Contents', `This database holds WordPress tables (${wordpress.slice(0, 3).join(', ')}). The CMS must not be initialised here. Use a new, empty database.`); }
    else if (!names.length) add('contents', 'ok', 'Contents', 'The database is empty. This is the correct starting point.');
    else if (ours) { state = 'cms'; add('contents', 'ok', 'Contents', `This is already a Foreign Africa CMS database (${names.length} tables).`); }
    else { state = 'foreign'; add('contents', 'fail', 'Contents', `This database already holds ${names.length} table(s) that are not the CMS's. Initialisation would be refused. Use a new, empty database.`); }

    const files = migrationFiles(migrationsDirectory).map(file => file.replace(/\.sql$/, ''));
    let applied = [];
    if (ours) { const [rows] = await pool.query('SELECT id FROM schema_migrations ORDER BY id'); applied = rows.map(row => row.id); }
    const pending = files.filter(id => !applied.includes(id));
    add('migrations', pending.length && state !== 'wordpress' && state !== 'foreign' ? 'info' : 'ok', 'Migrations', `${applied.length} applied, ${pending.length} would be applied${pending.length ? ` (${pending[0]} to ${pending[pending.length - 1]})` : ''}.`);

    if (state === 'cms' && names.includes('users') && names.includes('user_roles')) {
      const [[admins]] = await pool.query("SELECT COUNT(*) AS n FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id WHERE r.role_key = 'super_admin' AND u.deleted_at IS NULL");
      add('administrator', Number(admins.n) > 0 ? 'ok' : 'info', 'Administrator', Number(admins.n) > 0 ? 'A super administrator exists. BOOTSTRAP_ADMIN_* will be ignored.' : 'No super administrator exists yet.');
    } else add('administrator', 'info', 'Administrator', 'None yet. The first start creates one from BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD.');

    const [grantRows] = await pool.query('SHOW GRANTS FOR CURRENT_USER()');
    const grants = analyseGrants(grantRows.map(row => Object.values(row)[0]), info.name);
    const needed = ['CREATE', 'ALTER', 'SELECT', 'INSERT'].filter(privilege => !grants[privilege.toLowerCase()]);
    add('privileges', needed.length ? 'fail' : 'ok', 'Privileges', needed.length ? `This account lacks ${needed.join(', ')} on the database, which migrations need.` : `The account can create and alter tables here${grants.allPrivilegesHere ? ' (it has ALL PRIVILEGES on this database, which is acceptable for a dedicated CMS database)' : ''}.`);
    if (grants.globalPrivileges) add('scope', 'warn', 'Account scope', 'This account has privileges on ALL databases, not just this one. A dedicated account limited to this database is safer.');
    const [visible] = await pool.query('SHOW DATABASES');
    const others = visible.map(row => Object.values(row)[0]).filter(name => !['information_schema', 'performance_schema', 'mysql', 'sys', info.name].includes(name));
    add('isolation', others.length ? 'warn' : 'ok', 'Other databases', others.length ? `This account can also see ${others.length} other database(s). Confirm that none is the WordPress database, and consider limiting the account to this database only.` : 'This account cannot see any other database.');

    const confirmed = env.PREPARE_DATABASE_CONFIRM && env.PREPARE_DATABASE_CONFIRM === info.name;
    add('confirmation', confirmed ? 'ok' : 'info', 'Confirmation', confirmed ? 'PREPARE_DATABASE_CONFIRM matches DB_NAME.' : 'To initialise, set PREPARE_DATABASE=1 and PREPARE_DATABASE_CONFIRM to the exact name of this database (the same text as DB_NAME).');
    const hasBootstrap = Boolean(env.BOOTSTRAP_ADMIN_EMAIL && env.BOOTSTRAP_ADMIN_PASSWORD);
    add('bootstrap', hasBootstrap || state === 'cms' ? 'ok' : 'info', 'First administrator', hasBootstrap ? 'BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are set.' : 'Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (12+ characters) before initialising.');
    const blocked = findings.some(finding => finding.status === 'fail');
    add('verdict', blocked ? 'fail' : 'ok', 'Safe to initialise', blocked ? 'No. Fix the items marked fail first. Nothing was changed.' : 'Yes. Nothing has been changed by this check.');
  } catch (error) {
    add('connection', 'fail', 'Connection', describeStartupError(error).detail);
    add('verdict', 'fail', 'Safe to initialise', 'Not yet: the database could not be examined. Nothing was changed.');
  } finally {
    if (pool) await pool.end().catch(() => {});
  }
  return findings;
}
