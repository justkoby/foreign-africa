import {allows} from './permissions.js';
import {fail} from './errors.js';
import {documentHtml, documentText, normalizeDocument} from './document.js';
import {mediaUrl} from './media.js';
import {slugify, sqlTime} from './text.js';

const types = new Set(['news', 'commentary', 'page', 'programme']);
const reviewStatuses = new Set(['in_review', 'changes_requested', 'approved', 'rejected']);
const writableStatuses = new Set(['draft', 'scheduled', 'published', 'archived', ...reviewStatuses]);
const orders = {updated: 'c.updated_at DESC', published: 'c.published_at DESC', title: 'c.title ASC'};

function timeValue(value) {
  if (value instanceof Date) return value.getTime();
  const text = String(value);
  return Date.parse(text.includes('T') ? text : `${text.replace(' ', 'T')}Z`);
}

function jsonValue(value, fallback) {
  if (value == null || value === '') return fallback;
  return typeof value === 'string' ? JSON.parse(value) : value;
}

async function recordActivity(pool, clock, entry) {
  await pool.execute(
    'INSERT INTO activity_logs (actor_id, action, subject_type, subject_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [entry.actorId ?? null, entry.action, entry.subjectType, String(entry.subjectId ?? ''), JSON.stringify(entry.metadata ?? {}), sqlTime(clock())],
  );
}

function presentContent(row, terms = []) {
  const raw = jsonValue(row.body_json, {text: ''});
  let document;
  try { document = normalizeDocument(raw); } catch { document = {type: 'doc', content: []}; }
  const text = documentText(document);
  const words = text ? text.split(/\s+/).length : 0;
  const category = terms.find(term => term.vocabulary === 'category');
  return {
    id: Number(row.id),
    type: row.content_type,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    document,
    body: text,
    html: row.body_html,
    status: row.status,
    publishedAt: row.published_at,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    authorId: Number(row.author_id),
    authorName: row.author_name || row.account_name || '',
    featured: Boolean(row.featured),
    featuredMediaId: row.featured_media_id ? Number(row.featured_media_id) : null,
    socialImageId: row.social_image_id ? Number(row.social_image_id) : null,
    image: mediaUrl(row.featured_media_id, row.featured_path),
    imageAlt: row.featured_alt || '',
    imageFit: row.image_fit || 'cover',
    socialImage: mediaUrl(row.social_image_id, row.social_path),
    externalUrl: row.external_url || '',
    sourceUrl: row.source_url || '',
    legacyId: row.legacy_id || '',
    location: row.location || '',
    category: category?.name || '',
    tags: terms.filter(term => term.vocabulary === 'tag').map(term => term.name),
    updatedAt: row.updated_at,
    complete: Boolean(text),
    readMinutes: Math.max(1, Math.round(words / 200) || 1),
  };
}

const rowSql = `SELECT c.*, u.name AS account_name, f.storage_path AS featured_path, f.alt_text AS featured_alt, s.storage_path AS social_path
  FROM content_items c
  JOIN users u ON u.id = c.author_id
  LEFT JOIN media_assets f ON f.id = c.featured_media_id AND f.deleted_at IS NULL
  LEFT JOIN media_assets s ON s.id = c.social_image_id AND s.deleted_at IS NULL`;

async function termsFor(pool, ids) {
  const map = new Map();
  if (!ids.length) return map;
  const [rows] = await pool.query(`SELECT ct.content_id, t.vocabulary, t.name FROM content_terms ct JOIN terms t ON t.id = ct.term_id WHERE ct.content_id IN (${ids.map(() => '?').join(',')})`, ids);
  for (const row of rows) {
    const key = Number(row.content_id);
    map.set(key, [...(map.get(key) ?? []), row]);
  }
  return map;
}

async function load(pool, whereSql, params) {
  const [rows] = await pool.execute(`${rowSql} WHERE ${whereSql}`, params);
  const terms = await termsFor(pool, rows.map(row => row.id));
  return rows.map(row => presentContent(row, terms.get(Number(row.id)) ?? []));
}

function contentInput(input, current) {
  const title = String(input.title ?? current?.title ?? '').trim();
  const summary = String(input.summary ?? current?.summary ?? '');
  const type = input.type ?? current?.type;
  const slug = slugify(input.slug || current?.slug || title);
  if (!types.has(type)) throw fail(400, 'Choose news, commentary, page, or programme.');
  if (title.length < 2 || title.length > 300) throw fail(400, 'Enter a title.');
  if (!slug) throw fail(400, 'Enter a slug.');
  if (summary.length > 5000) throw fail(400, 'The summary is too long.');
  const source = input.document !== undefined ? input.document : input.body !== undefined ? input.body : current?.document;
  const document = normalizeDocument(source ?? '');
  const authorName = String(input.authorName ?? current?.authorName ?? '').trim().slice(0, 300);
  const location = String(input.location ?? current?.location ?? '').trim().slice(0, 160);
  const imageFit = ['cover', 'contain'].includes(input.imageFit) ? input.imageFit : (current?.imageFit || 'cover');
  const seoTitle = String(input.seoTitle ?? current?.seoTitle ?? '').slice(0, 300);
  const seoDescription = String(input.seoDescription ?? current?.seoDescription ?? '').slice(0, 500);
  const category = String(input.category ?? current?.category ?? '').trim().slice(0, 160);
  const tags = [...new Set((input.tags ?? current?.tags ?? []).map(tag => String(tag).trim()).filter(Boolean))].slice(0, 20).map(tag => tag.slice(0, 80));
  const featured = input.featured === undefined ? Boolean(current?.featured) : Boolean(input.featured);
  return {title, summary, type, slug, document, html: documentHtml(document), authorName, location, imageFit, seoTitle, seoDescription, category, tags, featured};
}

async function mediaId(pool, value, current) {
  if (value === undefined) return current ?? null;
  if (value === null || value === '' || value === 0) return null;
  const id = Number(value);
  const [rows] = await pool.execute('SELECT id FROM media_assets WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!rows[0]) throw fail(400, 'Choose a file from the media library.');
  return id;
}

async function setTerms(pool, contentId, category, tags) {
  await pool.execute('DELETE FROM content_terms WHERE content_id = ?', [contentId]);
  for (const [vocabulary, name] of [['category', category], ...tags.map(tag => ['tag', tag])]) {
    const label = String(name || '').trim();
    const slug = slugify(label);
    if (!slug) continue;
    await pool.execute('INSERT INTO terms (vocabulary, name, slug) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)', [vocabulary, label, slug]);
    const [rows] = await pool.execute('SELECT id FROM terms WHERE vocabulary = ? AND slug = ?', [vocabulary, slug]);
    await pool.execute('INSERT IGNORE INTO content_terms (content_id, term_id) VALUES (?, ?)', [contentId, rows[0].id]);
  }
}

async function snapshot(pool, clock, contentId, editorId, fields) {
  const copy = {title: fields.title, slug: fields.slug, summary: fields.summary, document: fields.document, seoTitle: fields.seoTitle, seoDescription: fields.seoDescription, authorName: fields.authorName, category: fields.category, tags: fields.tags, featured: fields.featured, featuredMediaId: fields.featuredMediaId, socialImageId: fields.socialImageId, location: fields.location, imageFit: fields.imageFit, status: fields.status};
  await pool.execute('INSERT INTO content_revisions (content_id, editor_id, snapshot, created_at) VALUES (?, ?, ?, ?)', [contentId, editorId, JSON.stringify(copy), sqlTime(clock())]);
}

function publicationTime(input, current, status, clock) {
  let publishedAt = current?.publishedAt ? sqlTime(timeValue(current.publishedAt)) : null;
  if (input.publishedAt) {
    const raw = String(input.publishedAt);
    const when = Date.parse(raw.includes('T') ? raw : `${raw}T12:00:00Z`);
    if (!Number.isFinite(when)) throw fail(400, 'Enter a valid publication date.');
    publishedAt = sqlTime(when);
  }
  if (status === 'published' && !publishedAt) publishedAt = sqlTime(clock());
  if (status === 'scheduled') {
    const when = timeValue(publishedAt || '');
    if (!Number.isFinite(when) || when <= clock()) throw fail(400, 'Choose a future publication time.');
  }
  return publishedAt;
}

export async function getContent(pool, id) {
  const [item] = await load(pool, 'c.id = ? AND c.deleted_at IS NULL', [id]);
  if (!item) throw fail(404, 'That page was not found.');
  return item;
}

export async function listContent(pool, {type, status, q, includeDrafts, page = 1, pageSize = 20, sort = 'updated', clock = () => Date.now()} = {}) {
  const where = ['c.deleted_at IS NULL'];
  const params = [];
  if (!includeDrafts) {
    where.push("c.status = 'published' AND (c.published_at IS NULL OR c.published_at <= ?)");
    params.push(sqlTime(clock()));
  }
  if (type) {
    if (!types.has(type)) throw fail(400, 'Unknown content type.');
    where.push('c.content_type = ?');
    params.push(type);
  }
  if (status) {
    if (!writableStatuses.has(status)) throw fail(400, 'Unknown status.');
    where.push('c.status = ?');
    params.push(status);
  }
  if (q) {
    where.push("(c.title LIKE ? ESCAPE '\\\\' OR c.summary LIKE ? ESCAPE '\\\\')");
    const like = `%${String(q).replace(/[\\%_]/g, match => `\\${match}`)}%`;
    params.push(like, like);
  }
  const size = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const current = Math.max(Number(page) || 1, 1);
  const order = orders[sort] || orders.updated;
  const [countRows] = await pool.execute(`SELECT COUNT(*) AS n FROM content_items c WHERE ${where.join(' AND ')}`, params);
  const items = await load(pool, `${where.join(' AND ')} ORDER BY ${order} LIMIT ${size} OFFSET ${(current - 1) * size}`, params);
  return {items, total: Number(countRows[0].n), page: current, pageSize: size};
}

function canEdit(actor, item) {
  if (allows(actor.roles, 'content.update.any')) return true;
  return allows(actor.roles, 'content.update.own') && Number(item.authorId) === Number(actor.id) && item.status === 'draft';
}

async function writeContent(pool, clock, actor, id, input, current) {
  const fields = contentInput(input, current);
  let status = input.status ?? current?.status ?? 'draft';
  if (!writableStatuses.has(status)) throw fail(400, 'Unknown status.');
  if (!allows(actor.roles, 'content.publish')) status = 'draft';
  const featuredMediaId = await mediaId(pool, input.featuredMediaId, current?.featuredMediaId);
  const socialImageId = await mediaId(pool, input.socialImageId, current?.socialImageId);
  const publishedAt = publicationTime(input, current, id ? status : 'draft', clock);
  const values = [fields.title, fields.slug, fields.summary, JSON.stringify(fields.document), fields.html, featuredMediaId, socialImageId, fields.authorName, fields.location, fields.imageFit, status, publishedAt, fields.seoTitle, fields.seoDescription, fields.featured ? 1 : 0, sqlTime(clock())];
  try {
    if (!id) {
      const [result] = await pool.execute(
        `INSERT INTO content_items (content_type, title, slug, summary, body_json, body_html, featured_media_id, social_image_id, author_id, author_name, location, image_fit, status, published_at, seo_title, seo_description, featured, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`,
        [fields.type, fields.title, fields.slug, fields.summary, JSON.stringify(fields.document), fields.html, featuredMediaId, socialImageId, actor.id, fields.authorName, fields.location, fields.imageFit, publishedAt, fields.seoTitle, fields.seoDescription, fields.featured ? 1 : 0, sqlTime(clock()), sqlTime(clock())],
      );
      id = result.insertId;
      status = 'draft';
    } else {
      await pool.execute(
        `UPDATE content_items SET title = ?, slug = ?, summary = ?, body_json = ?, body_html = ?, featured_media_id = ?, social_image_id = ?, author_name = ?, location = ?, image_fit = ?, status = ?, published_at = ?, seo_title = ?, seo_description = ?, featured = ?, updated_at = ? WHERE id = ?`,
        [...values, id],
      );
    }
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw fail(409, 'That slug is already used for this type.');
    throw error;
  }
  await setTerms(pool, id, fields.category, fields.tags);
  await snapshot(pool, clock, id, actor.id, {...fields, featuredMediaId, socialImageId, status});
  return {id, fields, status};
}

export async function createContent({pool, clock, actor, input}) {
  if (!allows(actor.roles, 'content.publish') && input.status && input.status !== 'draft') throw fail(403, 'You do not have permission to publish.');
  const written = await writeContent(pool, clock, actor, null, {...input, status: 'draft'}, null);
  await recordActivity(pool, clock, {actorId: actor.id, action: 'content.created', subjectType: 'content', subjectId: written.id, metadata: {type: written.fields.type, status: 'draft'}});
  return getContent(pool, written.id);
}

export async function updateContent({pool, clock, actor, id, input}) {
  const current = await getContent(pool, id);
  if (!canEdit(actor, current)) throw fail(403, 'You cannot edit that page.');
  const written = await writeContent(pool, clock, actor, id, input, current);
  const action = written.status === current.status ? 'content.updated' : written.status === 'published' ? 'content.published' : written.status === 'archived' ? 'content.archived' : written.status === 'draft' ? 'content.unpublished' : 'content.updated';
  await recordActivity(pool, clock, {actorId: actor.id, action, subjectType: 'content', subjectId: id, metadata: {type: written.fields.type, status: written.status}});
  return getContent(pool, id);
}

export async function setContentState({pool, clock, actor, id, status, publishedAt}) {
  if (!allows(actor.roles, 'content.publish')) throw fail(403, 'You do not have permission to publish.');
  return updateContent({pool, clock, actor, id, input: {status, publishedAt}});
}

export async function deleteContent({pool, clock, actor, id}) {
  if (!allows(actor.roles, 'content.delete')) throw fail(403, 'You do not have permission to delete that page.');
  await getContent(pool, id);
  await pool.execute('UPDATE content_items SET deleted_at = ?, updated_at = ? WHERE id = ?', [sqlTime(clock()), sqlTime(clock()), id]);
  await recordActivity(pool, clock, {actorId: actor.id, action: 'content.deleted', subjectType: 'content', subjectId: id, metadata: {}});
}

export async function duplicateContent({pool, clock, actor, id}) {
  const current = await getContent(pool, id);
  if (!canEdit(actor, current) && !allows(actor.roles, 'content.read')) throw fail(403, 'You cannot copy that page.');
  if (!allows(actor.roles, 'content.update.any') && Number(current.authorId) !== Number(actor.id)) throw fail(403, 'You cannot copy that page.');
  const copy = await createContent({pool, clock, actor, input: {...current, slug: `${current.slug}-copy`, status: 'draft', featured: false}});
  await recordActivity(pool, clock, {actorId: actor.id, action: 'content.duplicated', subjectType: 'content', subjectId: copy.id, metadata: {from: id}});
  return copy;
}

export async function revisions(pool, id) {
  await getContent(pool, id);
  const [rows] = await pool.execute('SELECT r.id, r.editor_id, u.name AS editor_name, r.snapshot, r.created_at FROM content_revisions r JOIN users u ON u.id = r.editor_id WHERE r.content_id = ? ORDER BY r.id DESC LIMIT 30', [id]);
  return rows.map(row => {
    const snapshot = typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot;
    let text = '';
    try { text = documentText(normalizeDocument(snapshot.document ?? snapshot.body ?? '')); } catch { text = String(snapshot.body || ''); }
    return {id: Number(row.id), editorId: Number(row.editor_id), editorName: row.editor_name, createdAt: row.created_at, title: snapshot.title || '', text, snapshot};
  });
}

export async function restoreRevision({pool, clock, actor, contentId, revisionId}) {
  if (!allows(actor.roles, 'content.update.any')) throw fail(403, 'You cannot restore that revision.');
  const [rows] = await pool.execute('SELECT snapshot FROM content_revisions WHERE id = ? AND content_id = ?', [revisionId, contentId]);
  if (!rows[0]) throw fail(404, 'That revision was not found.');
  const snapshot = typeof rows[0].snapshot === 'string' ? JSON.parse(rows[0].snapshot) : rows[0].snapshot;
  const item = await updateContent({pool, clock, actor, id: contentId, input: {...snapshot, document: snapshot.document ?? snapshot.body ?? '', status: 'draft'}});
  await recordActivity(pool, clock, {actorId: actor.id, action: 'content.restored', subjectType: 'content', subjectId: contentId, metadata: {revisionId}});
  return item;
}

export async function promoteScheduled(pool, clock) {
  const [result] = await pool.execute("UPDATE content_items SET status = 'published', updated_at = ? WHERE status = 'scheduled' AND deleted_at IS NULL AND published_at <= ?", [sqlTime(clock()), sqlTime(clock())]);
  return result.affectedRows ?? 0;
}

export async function publicItem(pool, type, slug, clock = () => Date.now()) {
  const [item] = await load(pool, "c.content_type = ? AND c.slug = ? AND c.deleted_at IS NULL AND c.status = 'published' AND (c.published_at IS NULL OR c.published_at <= ?)", [type, slug, sqlTime(clock())]);
  return item ?? null;
}

export function publicView(item) {
  if (!item) return null;
  const {document, legacyId, sourceUrl, ...visible} = item;
  return visible;
}

export async function importContent({pool, clock, actor, input}) {
  const document = normalizeDocument(input.document ?? '');
  const slug = slugify(input.slug || input.title);
  const [existing] = await pool.execute('SELECT id FROM content_items WHERE content_type = ? AND slug = ? AND deleted_at IS NULL', [input.type, slug]);
  if (existing[0]) return {status: 'exists', id: Number(existing[0].id)};
  const publishedAt = input.publishedAt ? sqlTime(Date.parse(input.publishedAt)) : null;
  const status = input.status || 'published';
  const [result] = await pool.execute(
    `INSERT INTO content_items (content_type, title, slug, summary, body_json, body_html, featured_media_id, social_image_id, author_id, author_name, location, image_fit, status, published_at, seo_title, seo_description, featured, external_url, source_url, legacy_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.type, input.title, slug, input.summary || '', JSON.stringify(document), documentHtml(document), input.featuredMediaId || null, input.socialImageId || null, actor.id, input.authorName || '', input.location || '', input.imageFit || 'cover', status, publishedAt, input.seoTitle || '', input.seoDescription || input.summary || '', input.featured ? 1 : 0, input.externalUrl || '', input.sourceUrl || '', input.legacyId || '', sqlTime(clock()), sqlTime(clock())],
  );
  await setTerms(pool, result.insertId, input.category || '', input.tags || []);
  await snapshot(pool, clock, result.insertId, actor.id, {...input, document, slug, status, featuredMediaId: input.featuredMediaId || null, socialImageId: input.socialImageId || null});
  return {status: 'inserted', id: Number(result.insertId)};
}

export function editorCanSee(actor, item) {
  return canEdit(actor, item) || allows(actor.roles, 'content.update.any');
}
