import bcrypt from 'bcryptjs';
import {allows, primaryRole} from './permissions.js';
import {fail} from './errors.js';
import {hashIp, hashToken, newToken, sqlTime} from './text.js';

export {fail};
export {createContent, listContent, getContent, updateContent, setContentState, deleteContent, duplicateContent, revisions, restoreRevision, promoteScheduled, publicItem, publicView, importContent, editorCanSee} from './content-store.js';

const sessionMs = 7 * 24 * 60 * 60 * 1000;
const windowMs = 15 * 60 * 1000;
let paddingHash = '';
let paddingCost = 0;

function timeValue(value) {
  if (value instanceof Date) return value.getTime();
  const text = String(value).includes('T') ? String(value) : `${String(value).replace(' ', 'T')}Z`;
  return Date.parse(text);
}

async function rolesFor(pool, userId) {
  const [rows] = await pool.execute('SELECT roles.role_key FROM user_roles JOIN roles ON roles.id = user_roles.role_id WHERE user_roles.user_id = ?', [userId]);
  return rows.map(row => row.role_key);
}

export function presentUser(row, roleKeys) {
  return {id: Number(row.id), email: row.email, name: row.name, status: row.status, roles: roleKeys, role: primaryRole(roleKeys)};
}

async function recordActivity(pool, clock, entry) {
  await pool.execute(
    'INSERT INTO activity_logs (actor_id, action, subject_type, subject_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [entry.actorId ?? null, entry.action, entry.subjectType, String(entry.subjectId ?? ''), JSON.stringify(entry.metadata ?? {}), sqlTime(clock())],
  );
}

export async function userCount(pool) {
  const [rows] = await pool.execute('SELECT COUNT(*) AS n FROM users WHERE deleted_at IS NULL');
  return Number(rows[0].n);
}

export async function provisionAdmin({pool, config, clock, email, name, password}) {
  if (await userCount(pool) > 0) throw fail(409, 'An account already exists. An administrator can add the next person.');
  return createUser({pool, config, clock, actor: null, input: {email, name: name || 'Administrator', password, role: 'super_admin'}});
}

export async function createUser({pool, config, clock, actor, input}) {
  const email = String(input.email ?? '').trim().toLowerCase();
  const name = String(input.name ?? '').trim();
  const role = input.role;
  const password = String(input.password ?? '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, 'Enter a valid email address.');
  if (name.length < 2 || name.length > 160) throw fail(400, 'Enter the person’s name.');
  if (!['super_admin', 'admin', 'editor', 'contributor'].includes(role)) throw fail(400, 'Choose a role.');
  if (role === 'super_admin' && actor && !allows(actor.roles, 'users.assign_super')) throw fail(403, 'Only a super administrator can assign that role.');
  if (password.length < 12 || password.length > 200) throw fail(400, 'Use a password of at least 12 characters.');
  const hash = await bcrypt.hash(password, config.passwordCost);
  const now = sqlTime(clock());
  try {
    const [result] = await pool.execute(
      'INSERT INTO users (email, name, password_hash, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [email, name, hash, 'active', now, now],
    );
    await pool.execute('INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE role_key = ?', [result.insertId, role]);
    await recordActivity(pool, clock, {actorId: actor?.id ?? result.insertId, action: 'user.created', subjectType: 'user', subjectId: result.insertId, metadata: {role}});
    const [rows] = await pool.execute('SELECT id, email, name, status FROM users WHERE id = ?', [result.insertId]);
    return presentUser(rows[0], [role]);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw fail(409, 'An account with that email already exists.');
    throw error;
  }
}

export async function updateUser({pool, clock, actor, userId, input}) {
  const [rows] = await pool.execute('SELECT id, email, name, status FROM users WHERE id = ? AND deleted_at IS NULL', [userId]);
  if (!rows[0]) throw fail(404, 'That account was not found.');
  const currentRoles = await rolesFor(pool, userId);
  if (input.role) {
    if (!['super_admin', 'admin', 'editor', 'contributor'].includes(input.role)) throw fail(400, 'Choose a role.');
    if (input.role === 'super_admin' && !allows(actor.roles, 'users.assign_super')) throw fail(403, 'Only a super administrator can assign that role.');
    if (Number(actor.id) === Number(userId) && currentRoles.includes('super_admin') && input.role !== 'super_admin') {
      const [count] = await pool.execute("SELECT COUNT(*) AS n FROM user_roles JOIN roles ON roles.id = user_roles.role_id WHERE roles.role_key = 'super_admin'");
      if (Number(count[0].n) < 2) throw fail(400, 'Keep at least one super administrator.');
    }
    await pool.execute('DELETE FROM user_roles WHERE user_id = ?', [userId]);
    await pool.execute('INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE role_key = ?', [userId, input.role]);
  }
  if (input.status) {
    if (!['active', 'disabled'].includes(input.status)) throw fail(400, 'Choose a valid account status.');
    if (Number(actor.id) === Number(userId) && input.status === 'disabled') throw fail(400, 'You cannot disable your own account.');
    await pool.execute('UPDATE users SET status = ?, updated_at = ? WHERE id = ?', [input.status, sqlTime(clock()), userId]);
    if (input.status === 'disabled') await pool.execute('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', [sqlTime(clock()), userId]);
  }
  if (input.name) {
    const name = String(input.name).trim();
    if (name.length < 2 || name.length > 160) throw fail(400, 'Enter the person’s name.');
    await pool.execute('UPDATE users SET name = ?, updated_at = ? WHERE id = ?', [name, sqlTime(clock()), userId]);
  }
  await recordActivity(pool, clock, {actorId: actor.id, action: 'user.updated', subjectType: 'user', subjectId: userId, metadata: {role: input.role, status: input.status}});
  const [next] = await pool.execute('SELECT id, email, name, status FROM users WHERE id = ?', [userId]);
  return presentUser(next[0], await rolesFor(pool, userId));
}

export async function changePassword({pool, config, clock, user, currentPassword, newPassword}) {
  const [rows] = await pool.execute('SELECT password_hash FROM users WHERE id = ?', [user.id]);
  const matches = await bcrypt.compare(String(currentPassword ?? ''), rows[0].password_hash);
  if (!matches) throw fail(400, 'The current password is not correct.');
  if (String(newPassword ?? '').length < 12) throw fail(400, 'Use a password of at least 12 characters.');
  const hash = await bcrypt.hash(String(newPassword), config.passwordCost);
  await pool.execute('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hash, sqlTime(clock()), user.id]);
  await recordActivity(pool, clock, {actorId: user.id, action: 'user.password_changed', subjectType: 'user', subjectId: user.id, metadata: {}});
}

async function locked(pool, clock, email, ipHash) {
  const since = sqlTime(clock() - windowMs);
  const [byEmail] = await pool.execute('SELECT COUNT(*) AS n FROM login_attempts WHERE success = 0 AND email = ? AND created_at > ?', [email, since]);
  const [byIp] = await pool.execute('SELECT COUNT(*) AS n FROM login_attempts WHERE success = 0 AND ip_hash = ? AND created_at > ?', [ipHash, since]);
  return Number(byEmail[0].n) >= 8 || Number(byIp[0].n) >= 30;
}

export async function login({pool, config, clock, email, password, ip, userAgent}) {
  const normalised = String(email ?? '').trim().toLowerCase();
  const ipHash = hashIp(ip, config.sessionSecret);
  if (await locked(pool, clock, normalised, ipHash)) throw fail(429, 'Too many attempts. Try again later.');
  const [rows] = await pool.execute('SELECT id, email, name, status, password_hash FROM users WHERE email = ? AND deleted_at IS NULL', [normalised]);
  const row = rows[0];
  if (!row && (paddingCost !== config.passwordCost || !paddingHash)) {
    paddingHash = await bcrypt.hash('staff-login-padding', config.passwordCost);
    paddingCost = config.passwordCost;
  }
  const matches = await bcrypt.compare(String(password ?? ''), row ? row.password_hash : paddingHash);
  const reason = !row ? 'unknown' : row.status !== 'active' ? 'disabled' : !matches ? 'password' : '';
  await pool.execute('INSERT INTO login_attempts (email, ip_hash, success, created_at) VALUES (?, ?, ?, ?)', [normalised.slice(0, 255), ipHash, reason ? 0 : 1, sqlTime(clock())]);
  if (reason) {
    await recordActivity(pool, clock, {actorId: row?.id ?? null, action: 'user.login.failure', subjectType: 'user', subjectId: row?.id ?? '', metadata: {reason}});
    throw fail(401, 'Those details are not correct.');
  }
  const token = newToken();
  await pool.execute(
    'INSERT INTO sessions (user_id, token_hash, expires_at, created_at, ip_hash, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
    [row.id, hashToken(token, config.sessionSecret), sqlTime(clock() + sessionMs), sqlTime(clock()), ipHash, String(userAgent ?? '').slice(0, 255)],
  );
  await recordActivity(pool, clock, {actorId: row.id, action: 'user.login', subjectType: 'user', subjectId: row.id, metadata: {}});
  return {token, user: presentUser(row, await rolesFor(pool, row.id))};
}

export async function userFromToken(pool, config, clock, token) {
  if (!token || !config.sessionSecret) return null;
  const [rows] = await pool.execute(
    'SELECT users.id, users.email, users.name, users.status, sessions.expires_at, sessions.revoked_at FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND users.deleted_at IS NULL',
    [hashToken(token, config.sessionSecret)],
  );
  const row = rows[0];
  if (!row || row.revoked_at || row.status !== 'active') return null;
  if (timeValue(row.expires_at) <= clock()) return null;
  return presentUser(row, await rolesFor(pool, row.id));
}

export async function revokeToken(pool, config, clock, token, actorId) {
  if (!token) return;
  await pool.execute('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL', [sqlTime(clock()), hashToken(token, config.sessionSecret)]);
  if (actorId) await recordActivity(pool, clock, {actorId, action: 'user.logout', subjectType: 'user', subjectId: actorId, metadata: {}});
}

export async function dashboard(pool) {
  const [counts] = await pool.execute('SELECT status, COUNT(*) AS n FROM content_items WHERE deleted_at IS NULL GROUP BY status');
  const [activity] = await pool.execute('SELECT id, actor_id, action, subject_type, subject_id, created_at FROM activity_logs ORDER BY id DESC LIMIT 8');
  const tally = Object.fromEntries(counts.map(row => [row.status, Number(row.n)]));
  return {
    content: {draft: tally.draft ?? 0, published: tally.published ?? 0, scheduled: tally.scheduled ?? 0, archived: tally.archived ?? 0, inReview: tally.in_review ?? 0},
    recentActivity: activity.map(row => ({id: Number(row.id), actorId: row.actor_id ? Number(row.actor_id) : null, action: row.action, subjectType: row.subject_type, subjectId: row.subject_id, createdAt: row.created_at})),
  };
}

export async function listUsers(pool) {
  const [rows] = await pool.execute('SELECT id, email, name, status FROM users WHERE deleted_at IS NULL ORDER BY name');
  const users = [];
  for (const row of rows) users.push(presentUser(row, await rolesFor(pool, row.id)));
  return users;
}

export async function listActivity(pool) {
  const [rows] = await pool.execute('SELECT id, actor_id, action, subject_type, subject_id, metadata, created_at FROM activity_logs ORDER BY id DESC LIMIT 100');
  return rows.map(row => ({id: Number(row.id), actorId: row.actor_id ? Number(row.actor_id) : null, action: row.action, subjectType: row.subject_type, subjectId: row.subject_id, metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata, createdAt: row.created_at}));
}

export async function databaseReachable(pool) {
  await pool.query('SELECT 1 AS ok');
}
