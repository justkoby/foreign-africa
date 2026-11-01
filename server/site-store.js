import {fail} from './errors.js';
import {allows} from './permissions.js';
import {sqlTime} from './text.js';
import {defaultHero, defaultHomepage, validateHero, validateHomepage, validationContext} from './site-schema.js';
import {approvedVideos, knownPartners, knownStories} from './site-approved.js';
import {ctaHosts} from './site-schema.js';
import {withDefaults} from '../src/site-content.js';

export const siteKeys = ['hero', 'homepage'];
export const siteLabels = {hero: 'Hero slider', homepage: 'Homepage sections'};

const parse = value => (value == null || value === '' ? null : typeof value === 'string' ? JSON.parse(value) : value);
const stable = value => JSON.stringify(value, (key, item) => (item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(name => [name, item[name]])) : item));
const same = (a, b) => stable(a) === stable(b);
const defaults = key => (key === 'hero' ? defaultHero() : defaultHomepage());

function checkKey(key) {
  if (!siteKeys.includes(key)) throw fail(404, 'Unknown content area.');
  return key;
}

async function audit(pool, clock, actor, action, key, metadata = {}) {
  await pool.execute('INSERT INTO activity_logs (actor_id, action, subject_type, subject_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)', [actor?.id ?? null, action, 'site', key, JSON.stringify(metadata), sqlTime(clock())]);
}

export async function getSettings(pool) {
  const [rows] = await pool.execute("SELECT setting_value FROM settings WHERE setting_key = 'homepage_editors_can_publish'");
  return {editorsCanPublish: rows[0]?.setting_value === '1'};
}

export async function saveSettings({pool, clock, actor, input}) {
  if (typeof input?.editorsCanPublish !== 'boolean') throw fail(400, 'Choose on or off.');
  await pool.execute("INSERT INTO settings (setting_key, setting_value) VALUES ('homepage_editors_can_publish', ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)", [input.editorsCanPublish ? '1' : '0']);
  await audit(pool, clock, actor, 'site.settings', 'homepage', {editorsCanPublish: input.editorsCanPublish});
  return getSettings(pool);
}

export const canEdit = user => allows(user.roles, 'homepage.edit');
export const canPublish = (user, settings) => allows(user.roles, 'homepage.publish') || (allows(user.roles, 'homepage.edit') && Boolean(settings.editorsCanPublish));

async function mediaLookup(executor, id) {
  const [rows] = await executor.execute('SELECT mime_type, storage_path FROM media_assets WHERE id = ? AND deleted_at IS NULL', [id]);
  return rows[0] ?? null;
}

async function loadRow(executor, key, lock = false) {
  const [rows] = await executor.execute(`SELECT d.*, du.name AS draft_by_name, pu.name AS published_by_name FROM site_documents d LEFT JOIN users du ON du.id = d.draft_updated_by LEFT JOIN users pu ON pu.id = d.published_by WHERE d.doc_key = ?${lock ? ' FOR UPDATE' : ''}`, [key]);
  return rows[0] ?? null;
}

function stateOf(key, row) {
  const draft = parse(row?.draft_json);
  const published = parse(row?.published_json);
  const live = published ?? defaults(key);
  return {
    key, label: siteLabels[key], version: Number(row?.draft_version ?? 0),
    hasPublished: Boolean(published), publishedAt: row?.published_at ?? null, publishedBy: row?.published_by_name ?? null,
    draftSavedAt: row?.draft_updated_at ?? null, draftSavedBy: row?.draft_by_name ?? null,
    hasUnpublishedChanges: Boolean(draft) && !same(draft, live),
  };
}

// `executor` is the pool, or the one connection of a transaction, so a pool of size 1 never waits on itself.
async function validate(executor, config, key, document, previous, {forPublish = false} = {}) {
  const ctx = validationContext({config, mediaLookup: id => mediaLookup(executor, id), previous});
  const result = key === 'hero' ? await validateHero(document, ctx, {forPublish}) : await validateHomepage(document, ctx);
  if (result.problems.any) {
    const error = fail(400, `Check the highlighted fields (${result.problems.list.length} problem${result.problems.list.length === 1 ? '' : 's'}).`);
    error.problems = result.problems.list;
    throw error;
  }
  return result.value;
}

export function options(config) {
  return {approvedVideos: approvedVideos.map(({id, label, poster}) => ({id, label, poster})), partners: knownPartners, stories: knownStories, ctaHosts: ctaHosts(config)};
}

export async function getDocument({pool, config, key}) {
  checkKey(key);
  const row = await loadRow(pool, key);
  const draft = parse(row?.draft_json);
  const published = parse(row?.published_json);
  const effective = draft ?? published ?? defaults(key);
  return {key, document: key === 'homepage' ? withDefaults(defaultHomepage(), effective) : effective, published: published ?? null, state: stateOf(key, row), options: options(config)};
}

export async function overview(pool) {
  const [rows] = await pool.execute('SELECT d.*, du.name AS draft_by_name, pu.name AS published_by_name FROM site_documents d LEFT JOIN users du ON du.id = d.draft_updated_by LEFT JOIN users pu ON pu.id = d.published_by');
  return Object.fromEntries(siteKeys.map(key => [key, stateOf(key, rows.find(row => row.doc_key === key))]));
}

export async function saveDraft({pool, config, clock, actor, key, document, baseVersion}) {
  checkKey(key);
  if (!Number.isInteger(baseVersion) || baseVersion < 0) throw fail(400, 'Reload the page and try again.');
  const row = await loadRow(pool, key);
  const value = await validate(pool, config, key, document, [parse(row?.draft_json), parse(row?.published_json)]);
  if (row && same(parse(row.draft_json), value)) return stateOf(key, row);
  await pool.execute('INSERT IGNORE INTO site_documents (doc_key) VALUES (?)', [key]);
  const [result] = await pool.execute('UPDATE site_documents SET draft_json = ?, draft_version = draft_version + 1, draft_updated_at = ?, draft_updated_by = ? WHERE doc_key = ? AND draft_version = ?', [JSON.stringify(value), sqlTime(clock()), actor.id, key, baseVersion]);
  if (!result.affectedRows) throw fail(409, 'Someone else saved changes to this while you were editing. Reload to see their version before saving yours.');
  await pool.execute('INSERT INTO site_document_revisions (doc_key, kind, snapshot, created_by, created_at) VALUES (?, ?, ?, ?, ?)', [key, 'draft', JSON.stringify(value), actor.id, sqlTime(clock())]);
  await audit(pool, clock, actor, 'site.draft.saved', key);
  return stateOf(key, await loadRow(pool, key));
}

let cache = {at: 0, value: null};
export const forgetPublished = () => { cache = {at: 0, value: null}; };

// Publishing is always an explicit act. It copies the saved draft to the live copy inside one locked transaction.
export async function publish({pool, config, clock, actor, key, baseVersion}) {
  checkKey(key);
  const settings = await getSettings(pool);
  if (!canPublish(actor, settings)) throw fail(403, 'You do not have permission to publish this. Ask an administrator.');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const row = await loadRow(connection, key, true);
    const draft = parse(row?.draft_json);
    if (!draft) throw fail(409, 'There are no saved changes to publish.');
    if (baseVersion !== undefined && Number(baseVersion) !== Number(row.draft_version)) throw fail(409, 'The draft changed after you opened it. Reload, check it, and publish again.');
    const value = await validate(connection, config, key, draft, [draft, parse(row.published_json)], {forPublish: true});
    const now = sqlTime(clock());
    await connection.execute('UPDATE site_documents SET published_json = ?, published_at = ?, published_by = ?, draft_json = ?, draft_version = draft_version + 1 WHERE doc_key = ?', [JSON.stringify(value), now, actor.id, JSON.stringify(value), key]);
    await connection.execute('INSERT INTO site_document_revisions (doc_key, kind, snapshot, created_by, created_at) VALUES (?, ?, ?, ?, ?)', [key, 'published', JSON.stringify(value), actor.id, now]);
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
  forgetPublished();
  await audit(pool, clock, actor, 'site.published', key);
  return stateOf(key, await loadRow(pool, key));
}

export async function discardDraft({pool, clock, actor, key}) {
  checkKey(key);
  const row = await loadRow(pool, key);
  if (!row) return stateOf(key, null);
  await pool.execute('UPDATE site_documents SET draft_json = ?, draft_version = draft_version + 1, draft_updated_at = ?, draft_updated_by = ? WHERE doc_key = ?', [row.published_json == null ? null : JSON.stringify(parse(row.published_json)), sqlTime(clock()), actor.id, key]);
  await audit(pool, clock, actor, 'site.draft.discarded', key);
  return stateOf(key, await loadRow(pool, key));
}

export async function listRevisions({pool, key}) {
  checkKey(key);
  const [rows] = await pool.execute('SELECT r.id, r.kind, r.created_at, u.name AS author FROM site_document_revisions r LEFT JOIN users u ON u.id = r.created_by WHERE r.doc_key = ? ORDER BY r.id DESC LIMIT 40', [key]);
  return rows.map(row => ({id: Number(row.id), kind: row.kind, createdAt: row.created_at, author: row.author ?? ''}));
}

// Restoring puts an earlier version into the DRAFT only. Nothing changes on the live site until someone publishes.
export async function restoreRevision({pool, config, clock, actor, key, revisionId, baseVersion}) {
  checkKey(key);
  const [rows] = await pool.execute('SELECT snapshot FROM site_document_revisions WHERE id = ? AND doc_key = ?', [revisionId, key]);
  if (!rows[0]) throw fail(404, 'That version was not found.');
  const state = await saveDraft({pool, config, clock, actor, key, document: parse(rows[0].snapshot), baseVersion});
  await audit(pool, clock, actor, 'site.draft.restored', key, {revisionId});
  return state;
}

export async function publishedSite(pool, clock = () => Date.now()) {
  if (clock() - cache.at < 10000 && cache.value) return cache.value;
  const [rows] = await pool.execute('SELECT doc_key, published_json FROM site_documents WHERE published_json IS NOT NULL');
  const value = {};
  for (const row of rows) if (siteKeys.includes(row.doc_key)) value[row.doc_key] = parse(row.published_json);
  cache = {at: clock(), value};
  return value;
}

export async function draftSite({pool, config}) {
  const [hero, homepage] = await Promise.all(siteKeys.map(key => getDocument({pool, config, key})));
  return {preview: true, hero: hero.document, homepage: homepage.document};
}
