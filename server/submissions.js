import {createHash, randomBytes} from 'node:crypto';
import {existsSync, readFileSync} from 'node:fs';
import {fail} from './errors.js';
import {hashIp, sqlTime} from './text.js';

export const submissionStatuses = ['new', 'in_review', 'actioned', 'archived'];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Pure validation. Only fields declared by the form are read; anything else in the request is ignored.
export function validateSubmission(form, answers) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return {errors: {_form: 'Send the form answers.'}, clean: null};
  const errors = {};
  const clean = {};
  for (const field of form.fields ?? []) {
    const raw = answers[field.id];
    if (raw !== undefined && typeof raw !== 'string') { errors[field.id] = 'Enter text only.'; continue; }
    const value = String(raw ?? '').replace(/\r\n/g, '\n').trim();
    clean[field.id] = value;
    if (field.required && !value) errors[field.id] = `Enter ${String(field.label).toLowerCase()}.`;
    else if (value.length > 5000) errors[field.id] = 'Shorten this answer.';
    else if (field.type === 'email' && value && (value.length > 254 || !emailPattern.test(value))) errors[field.id] = 'Enter a valid email address.';
    else if (field.type === 'select' && value && !(field.options ?? []).includes(value)) errors[field.id] = 'Choose one of the listed options.';
    else if (field.type !== 'textarea' && value.includes('\n')) errors[field.id] = 'Use a single line.';
  }
  return {errors, clean};
}

function clientKey(formId, key) {
  return createHash('sha256').update(`${formId}:${String(key)}`).digest('hex');
}

function reference(clock) {
  return `FA-${clock().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

async function audit(pool, clock, actorId, action, subjectId, metadata = {}) {
  // Metadata must never contain answers, names or emails.
  await pool.execute('INSERT INTO activity_logs (actor_id, action, subject_type, subject_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)', [actorId ?? null, action, 'submission', String(subjectId ?? ''), JSON.stringify(metadata), sqlTime(clock())]);
}

async function ensureForm(pool, clock, form) {
  const now = sqlTime(clock());
  await pool.execute("INSERT INTO forms (form_key, title, success_message, status, created_at, updated_at) VALUES (?, ?, ?, 'published', ?, ?) ON DUPLICATE KEY UPDATE title = VALUES(title), success_message = VALUES(success_message), updated_at = VALUES(updated_at)", [form.id, String(form.title ?? form.id).slice(0, 200), String(form.success ?? '').slice(0, 500), now, now]);
  const [rows] = await pool.execute('SELECT id FROM forms WHERE form_key = ?', [form.id]);
  return rows[0].id;
}

export async function recordSubmission({pool, clock, secret, form, answers, key, ip}) {
  const {errors, clean} = validateSubmission(form, answers);
  if (Object.keys(errors).length) { const error = fail(400, 'Check the highlighted fields.'); error.errors = errors; throw error; }
  const formId = await ensureForm(pool, clock, form);
  const dedupe = clientKey(form.id, key || randomBytes(16).toString('hex'));
  const [existing] = await pool.execute('SELECT reference FROM submissions WHERE client_key = ?', [dedupe]);
  if (existing[0]) return {reference: existing[0].reference, duplicate: true, success: form.success};
  const payload = JSON.stringify({answers: clean, fields: (form.fields ?? []).map(field => ({id: field.id, label: String(field.label)}))});
  const ref = reference(clock);
  let result;
  try {
    [result] = await pool.execute('INSERT INTO submissions (reference, form_id, payload, client_key, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)', [ref, formId, payload, dedupe, ip ? hashIp(ip, secret) : null, sqlTime(clock())]);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') { const [again] = await pool.execute('SELECT reference FROM submissions WHERE client_key = ?', [dedupe]); if (again[0]) return {reference: again[0].reference, duplicate: true, success: form.success}; }
    throw error;
  }
  await audit(pool, clock, null, 'submission.created', result.insertId, {form: form.id, reference: ref});
  return {reference: ref, duplicate: false, success: form.success};
}

function present(row) {
  const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
  return {id: Number(row.id), reference: row.reference, form: row.form_key, formTitle: row.form_title, status: row.status, assignedTo: row.assigned_to ? Number(row.assigned_to) : null, assigneeName: row.assignee_name ?? null, createdAt: row.created_at, handledAt: row.handled_at, answers: payload.answers ?? {}, fields: payload.fields ?? []};
}

const select = 'SELECT s.id, s.reference, s.payload, s.status, s.assigned_to, s.handled_at, s.created_at, f.form_key, f.title AS form_title, u.name AS assignee_name FROM submissions s JOIN forms f ON f.id = s.form_id LEFT JOIN users u ON u.id = s.assigned_to';

function filters({status, form}) {
  const where = [];
  const params = [];
  if (status) { if (!submissionStatuses.includes(status)) throw fail(400, 'Unknown status.'); where.push('s.status = ?'); params.push(status); }
  if (form) { where.push('f.form_key = ?'); params.push(String(form).slice(0, 80)); }
  return {where, params};
}

export async function listSubmissions({pool, clock, actor, status, form, mine, page = 1, pageSize = 25}) {
  const {where, params} = filters({status, form});
  if (mine) { where.push('s.assigned_to = ?'); params.push(actor.id); }
  const size = Math.min(Math.max(Number(pageSize) || 25, 1), 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * size;
  const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const [rows] = await pool.query(`${select}${clause} ORDER BY s.created_at DESC, s.id DESC LIMIT ${size} OFFSET ${offset}`, params);
  const [total] = await pool.query(`SELECT COUNT(*) AS n FROM submissions s JOIN forms f ON f.id = s.form_id${clause}`, params);
  await audit(pool, clock, actor.id, 'submission.listed', '', {status: status || '', form: form || '', count: rows.length});
  return {items: rows.map(present), total: Number(total[0].n), page: Number(page) || 1, pageSize: size};
}

export async function getSubmission({pool, clock, actor, id}) {
  const [rows] = await pool.execute(`${select} WHERE s.id = ?`, [id]);
  if (!rows[0]) throw fail(404, 'That submission was not found.');
  const [notes] = await pool.execute('SELECT n.id, n.note, n.created_at, u.name AS author FROM submission_notes n JOIN users u ON u.id = n.author_id WHERE n.submission_id = ? ORDER BY n.created_at ASC, n.id ASC', [id]);
  await audit(pool, clock, actor.id, 'submission.viewed', id);
  return {...present(rows[0]), notes: notes.map(note => ({id: Number(note.id), note: note.note, author: note.author, createdAt: note.created_at}))};
}

export async function updateSubmission({pool, clock, actor, id, input}) {
  const [rows] = await pool.execute('SELECT id, status, assigned_to FROM submissions WHERE id = ?', [id]);
  if (!rows[0]) throw fail(404, 'That submission was not found.');
  const sets = [];
  const params = [];
  const changes = {};
  if (input.status !== undefined) {
    if (!submissionStatuses.includes(input.status)) throw fail(400, 'Choose a valid status.');
    sets.push('status = ?'); params.push(input.status); changes.status = input.status;
    sets.push('handled_at = ?'); params.push(['actioned', 'archived'].includes(input.status) ? sqlTime(clock()) : null);
  }
  if (input.assignedTo !== undefined) {
    if (input.assignedTo === null) { sets.push('assigned_to = NULL'); changes.assignedTo = null; }
    else {
      const userId = Number(input.assignedTo);
      const [people] = await pool.execute("SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id WHERE u.id = ? AND u.status = 'active' AND u.deleted_at IS NULL AND r.role_key IN ('super_admin', 'admin') LIMIT 1", [userId]);
      if (!people[0]) throw fail(400, 'Choose an active administrator to assign.');
      sets.push('assigned_to = ?'); params.push(userId); changes.assignedTo = userId;
    }
  }
  if (!sets.length) throw fail(400, 'Nothing to change.');
  await pool.execute(`UPDATE submissions SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  await audit(pool, clock, actor.id, 'submission.updated', id, changes);
}

export async function addNote({pool, clock, actor, id, note}) {
  const text = String(note ?? '').trim();
  if (!text || text.length > 4000) throw fail(400, 'Write a note of up to 4,000 characters.');
  const [rows] = await pool.execute('SELECT id FROM submissions WHERE id = ?', [id]);
  if (!rows[0]) throw fail(404, 'That submission was not found.');
  await pool.execute('INSERT INTO submission_notes (submission_id, author_id, note, created_at) VALUES (?, ?, ?, ?)', [id, actor.id, text, sqlTime(clock())]);
  await audit(pool, clock, actor.id, 'submission.noted', id);
}

// Spreadsheet programs run cells that begin with these characters as formulas.
export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function exportCsv({pool, clock, actor, status, form}) {
  const {where, params} = filters({status, form});
  const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const [rows] = await pool.query(`${select}${clause} ORDER BY s.created_at ASC, s.id ASC LIMIT 5000`, params);
  const items = rows.map(present);
  const keys = [...new Set(items.flatMap(item => item.fields.map(field => field.id)))];
  const labels = Object.fromEntries(items.flatMap(item => item.fields.map(field => [field.id, field.label])));
  const header = ['Reference', 'Form', 'Status', 'Received', ...keys.map(id => labels[id] ?? id)];
  const lines = [header.map(csvCell).join(',')];
  for (const item of items) lines.push([item.reference, item.formTitle, item.status, new Date(item.createdAt).toISOString(), ...keys.map(id => item.answers[id] ?? '')].map(csvCell).join(','));
  await audit(pool, clock, actor.id, 'submission.exported', '', {status: status || '', form: form || '', count: items.length});
  return `﻿${lines.join('\r\n')}\r\n`;
}

// One-time, idempotent move of the old data/cms/submissions.json into MySQL. The file is left untouched.
export async function importLegacySubmissions({pool, clock, secret, file, forms}) {
  if (!existsSync(file)) return {imported: 0, skipped: 0, missingForm: 0};
  let rows;
  try { rows = JSON.parse(readFileSync(file, 'utf8')); } catch { return {imported: 0, skipped: 0, missingForm: 0, unreadable: true}; }
  let imported = 0, skipped = 0, missingForm = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const form = forms.find(item => item.id === row.formId);
    if (!form) { missingForm += 1; continue; }
    const formId = await ensureForm(pool, clock, form);
    const dedupe = clientKey(form.id, row.key || row.reference);
    const [exists] = await pool.execute('SELECT id FROM submissions WHERE client_key = ? OR reference = ?', [dedupe, String(row.reference)]);
    if (exists[0]) { skipped += 1; continue; }
    const when = Date.parse(row.submittedAt);
    const payload = JSON.stringify({answers: row.answers ?? {}, fields: (form.fields ?? []).map(field => ({id: field.id, label: String(field.label)}))});
    await pool.execute('INSERT INTO submissions (reference, form_id, payload, client_key, created_at) VALUES (?, ?, ?, ?, ?)', [String(row.reference).slice(0, 40), formId, payload, dedupe, sqlTime(Number.isFinite(when) ? when : clock())]);
    imported += 1;
  }
  if (imported) await audit(pool, clock, null, 'submission.imported', '', {imported, skipped});
  return {imported, skipped, missingForm};
}
