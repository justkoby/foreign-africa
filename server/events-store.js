import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {allows} from './permissions.js';
import {fail} from './errors.js';
import {documentHtml, documentText, normalizeDocument, plainDocument} from './document.js';
import {mediaUrl, registerSiteFile} from './media.js';
import {likeContains, slugify, sqlTime} from './text.js';

export const EVENT_STATUSES = ['draft', 'in_review', 'changes_requested', 'approved', 'scheduled', 'published', 'rejected', 'archived'];
export const EVENT_FORMATS = ['physical', 'virtual', 'hybrid'];
export const REGISTRATION_MODES = ['none', 'url', 'form'];
export const MEETING_ACCESS_MODES = ['public', 'registered_only', 'private'];

const writableStatuses = new Set(EVENT_STATUSES);

function parseJson(value, fallback = null) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function cleanStr(value, maxLen = 240) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, maxLen);
}

function isoTime(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  const parsed = Date.parse(text.includes('T') ? text : `${text.replace(' ', 'T')}Z`);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : text;
}

function timeValue(value) {
  if (!value) return NaN;
  if (value instanceof Date) return value.getTime();
  const text = String(value);
  return Date.parse(text.includes('T') ? text : `${text.replace(' ', 'T')}Z`);
}

function normalizeDateString(value, startsAtIso) {
  const cleaned = cleanStr(value ?? '', 20);
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;
  if (startsAtIso && /^\d{4}-\d{2}-\d{2}/.test(startsAtIso)) {
    return startsAtIso.slice(0, 10);
  }
  return '';
}

function safeUrl(value, maxLen = 500) {
  const raw = cleanStr(value ?? '', maxLen);
  if (!raw) return '';
  if ((raw.startsWith('/') || raw.startsWith('#')) && !raw.startsWith('//') && !raw.includes('..')) return raw;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:') {
      return raw;
    }
  } catch {
    return '';
  }
  return '';
}

async function recordActivity(pool, clock, entry) {
  await pool.execute(
    'INSERT INTO activity_logs (actor_id, action, subject_type, subject_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [entry.actorId ?? null, entry.action, entry.subjectType, String(entry.subjectId ?? ''), JSON.stringify(entry.metadata ?? {}), sqlTime(clock())],
  );
}

function normalizeSpeakers(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map(item => ({
      name: cleanStr(item?.name ?? '', 140),
      role: cleanStr(item?.role ?? '', 160),
      organisation: cleanStr(item?.organisation ?? '', 160),
      bio: cleanStr(item?.bio ?? '', 600),
      photoUrl: safeUrl(item?.photoUrl ?? '', 500),
    }))
    .filter(item => item.name);
}

function normalizeAgenda(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map(item => ({
      time: cleanStr(item?.time ?? '', 80),
      title: cleanStr(item?.title ?? '', 200),
      speaker: cleanStr(item?.speaker ?? '', 160),
      description: cleanStr(item?.description ?? '', 600),
    }))
    .filter(item => item.title || item.time);
}

function normalizeDocuments(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map(item => ({
      title: cleanStr(item?.title ?? '', 200),
      url: safeUrl(item?.url ?? '', 500),
      mediaId: item?.mediaId ? Number(item.mediaId) : null,
      type: cleanStr(item?.type ?? 'PDF', 40),
    }))
    .filter(item => item.title && item.url);
}

function normalizeGallery(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map(item => ({
      mediaId: item?.mediaId ? Number(item.mediaId) : null,
      url: safeUrl(item?.url ?? '', 500),
      alt: cleanStr(item?.alt ?? '', 240),
      caption: cleanStr(item?.caption ?? '', 300),
    }))
    .filter(item => item.url);
}

function paragraphsFromHtml(html) {
  if (!html) return [];
  const matches = [...String(html).matchAll(/<(?:p|li|h2|h3|h4|blockquote)[^>]*>([\s\S]*?)<\/(?:p|li|h2|h3|h4|blockquote)>/gi)];
  const items = matches
    .map(match => match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (items.length) return items;
  const plain = String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return plain ? [plain] : [];
}

export function computeEventScheduleState(event, nowMs = Date.now()) {
  if (event.cancelled) return 'cancelled';
  const startsAtMs = timeValue(event.startsAt);
  const endsAtMs = timeValue(event.endsAt);
  const eventDate = event.eventDate || (event.startsAt ? String(event.startsAt).slice(0, 10) : '');

  if (!Number.isFinite(startsAtMs) && !eventDate) {
    return 'unannounced';
  }

  if (Number.isFinite(startsAtMs) && Number.isFinite(endsAtMs)) {
    if (nowMs < startsAtMs) return 'upcoming';
    if (nowMs <= endsAtMs) return 'ongoing';
    return 'past';
  }

  const todayIso = new Date(nowMs).toISOString().slice(0, 10);
  if (eventDate) {
    if (eventDate > todayIso) return 'upcoming';
    if (eventDate < todayIso) return 'past';
    if (Number.isFinite(startsAtMs)) {
      return nowMs >= startsAtMs ? 'ongoing' : 'upcoming';
    }
    return 'upcoming';
  }

  return nowMs <= startsAtMs ? 'upcoming' : 'past';
}

export function computeRegistrationState(event, nowMs = Date.now(), formPublished = true) {
  const mode = REGISTRATION_MODES.includes(event.registrationMode) ? event.registrationMode : 'none';
  if (mode === 'none') {
    return {open: false, reason: 'none', mode: 'none', label: ''};
  }
  const scheduleState = computeEventScheduleState(event, nowMs);
  if (event.cancelled || scheduleState === 'cancelled') {
    return {open: false, reason: 'cancelled', mode, label: 'Event cancelled'};
  }
  if (scheduleState === 'past') {
    return {open: false, reason: 'past', mode, label: 'Registration closed'};
  }
  if (event.registrationClosed) {
    return {open: false, reason: 'closed', mode, label: 'Registration closed'};
  }
  const openAtMs = timeValue(event.registrationOpenAt);
  if (Number.isFinite(openAtMs) && nowMs < openAtMs) {
    return {
      open: false,
      reason: 'not_yet_open',
      opensAt: isoTime(event.registrationOpenAt),
      mode,
      label: 'Registration opens soon',
    };
  }
  const closeAtMs = timeValue(event.registrationCloseAt);
  if (Number.isFinite(closeAtMs) && nowMs > closeAtMs) {
    return {
      open: false,
      reason: 'closed_window',
      closedAt: isoTime(event.registrationCloseAt),
      mode,
      label: 'Registration closed',
    };
  }
  if (mode === 'url' && !event.registrationUrl) {
    return {open: false, reason: 'unconfigured', mode, label: ''};
  }
  if (mode === 'form') {
    if (!event.registrationFormKey) {
      return {open: false, reason: 'unconfigured', mode, label: ''};
    }
    if (!formPublished) {
      return {open: false, reason: 'form_unpublished', mode, label: ''};
    }
  }
  return {
    open: true,
    reason: 'open',
    mode,
    label: event.registrationLabel || 'Register for event',
  };
}

function presentEvent(row, terms = [], nowMs = Date.now()) {
  const rawDoc = parseJson(row.body_json, null);
  let document;
  try {
    document = rawDoc ? normalizeDocument(rawDoc) : plainDocument(paragraphsFromHtml(row.body_html).join('\n\n'));
  } catch {
    document = {type: 'doc', content: []};
  }
  const text = documentText(document);
  const html = row.body_html || documentHtml(document);
  const details = paragraphsFromHtml(html);

  const startsAt = isoTime(row.starts_at);
  const endsAt = isoTime(row.ends_at);
  const eventDate = normalizeDateString(row.event_date, startsAt);
  const categoryTerm = terms.find(t => t.vocabulary === 'category');
  const tagNames = terms.filter(t => t.vocabulary === 'tag').map(t => t.name);
  const image = mediaUrl(row.featured_media_id, row.featured_path);
  const socialImage = mediaUrl(row.social_image_id, row.social_path);

  const item = {
    id: Number(row.id),
    type: 'event',
    slug: row.slug,
    title: row.title,
    summary: row.summary || '',
    document,
    body: text,
    html,
    details: details.length ? details : (row.summary ? [row.summary] : []),
    startsAt,
    endsAt,
    eventDate: eventDate || null,
    date: eventDate || null,
    timezone: row.timezone || 'Africa/Accra',
    timeLabel: row.time_label || '',
    format: row.format || 'physical',
    venue: row.venue || '',
    organiser: row.organiser || 'Foreign Africa',
    locationAddress: row.location_address || '',
    onlinePlatform: row.online_platform || '',
    meetingUrl: row.meeting_url || '',
    meetingAccess: row.meeting_access || 'private',
    featuredMediaId: row.featured_media_id ? Number(row.featured_media_id) : null,
    socialImageId: row.social_image_id ? Number(row.social_image_id) : null,
    image,
    imageAlt: row.featured_alt || '',
    imageFit: row.image_fit === 'contain' ? 'contain' : 'cover',
    socialImage,
    gallery: normalizeGallery(parseJson(row.gallery_json, [])),
    speakers: normalizeSpeakers(parseJson(row.speakers_json, [])),
    agenda: normalizeAgenda(parseJson(row.agenda_json, [])),
    documents: normalizeDocuments(parseJson(row.documents_json, [])),
    programmeId: row.programme_id || '',
    programmeLabel: row.programme_label || '',
    storyUrl: row.story_url || '',
    sourceLabel: row.source_label || '',
    sourceUrl: row.source_url || '',
    recordingUrl: row.recording_url || '',
    registrationMode: row.registration_mode || 'none',
    registrationUrl: row.registration_url || '',
    registrationFormKey: row.registration_form_key || '',
    registrationOpenAt: isoTime(row.registration_open_at),
    registrationCloseAt: isoTime(row.registration_close_at),
    registrationClosed: Boolean(row.registration_closed),
    registrationLabel: row.registration_label || '',
    status: row.status,
    cancelled: Boolean(row.cancelled),
    cancellationNote: row.cancellation_note || '',
    publishedAt: isoTime(row.published_at),
    featured: Boolean(row.featured),
    seoTitle: row.seo_title || '',
    seoDescription: row.seo_description || '',
    authorId: row.author_id ? Number(row.author_id) : null,
    authorName: row.author_name || row.account_name || 'Foreign Africa',
    category: categoryTerm?.name || row.programme_label || 'Event',
    tags: tagNames,
    createdAt: isoTime(row.created_at),
    updatedAt: isoTime(row.updated_at),
    complete: Boolean(text || row.summary),
  };

  item.scheduleState = computeEventScheduleState(item, nowMs);
  item.registrationStatus = computeRegistrationState(item, nowMs, true);
  return item;
}

const rowSql = `SELECT e.*, u.name AS account_name, f.storage_path AS featured_path, f.alt_text AS featured_alt, s.storage_path AS social_path
  FROM events e
  LEFT JOIN users u ON u.id = e.author_id
  LEFT JOIN media_assets f ON f.id = e.featured_media_id AND f.deleted_at IS NULL
  LEFT JOIN media_assets s ON s.id = e.social_image_id AND s.deleted_at IS NULL`;

async function termsForEvents(pool, ids) {
  const map = new Map();
  if (!ids.length) return map;
  const [rows] = await pool.query(
    `SELECT et.event_id, t.vocabulary, t.name, t.slug FROM event_terms et JOIN terms t ON t.id = et.term_id WHERE et.event_id IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  for (const row of rows) {
    const key = Number(row.event_id);
    map.set(key, [...(map.get(key) ?? []), row]);
  }
  return map;
}

async function setEventTerms(pool, eventId, category, tags) {
  await pool.execute('DELETE FROM event_terms WHERE event_id = ?', [eventId]);
  const tagList = Array.isArray(tags) ? tags : [];
  for (const [vocabulary, name] of [['category', category], ...tagList.map(tag => ['tag', tag])]) {
    const label = String(name || '').trim();
    const slug = slugify(label);
    if (!slug) continue;
    await pool.execute('INSERT INTO terms (vocabulary, name, slug) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE slug = slug', [vocabulary, label, slug]);
    const [rows] = await pool.execute('SELECT id FROM terms WHERE vocabulary = ? AND slug = ?', [vocabulary, slug]);
    if (rows[0]) {
      await pool.execute('INSERT IGNORE INTO event_terms (event_id, term_id) VALUES (?, ?)', [eventId, rows[0].id]);
    }
  }
}

async function mediaId(pool, value, current) {
  if (value === undefined) return current ?? null;
  if (value === null || value === '' || value === 0) return null;
  const id = Number(value);
  const [rows] = await pool.execute('SELECT id FROM media_assets WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!rows[0]) throw fail(400, 'Choose a file from the media library.');
  return id;
}

async function loadEvents(pool, whereSql, params, nowMs = Date.now()) {
  const [rows] = await pool.execute(`${rowSql} WHERE ${whereSql}`, params);
  const terms = await termsForEvents(pool, rows.map(row => row.id));
  return rows.map(row => presentEvent(row, terms.get(Number(row.id)) ?? [], nowMs));
}

function canEditEvent(actor, item) {
  if (allows(actor.roles, 'content.update.any')) return true;
  return allows(actor.roles, 'content.update.own') && Number(item.authorId) === Number(actor.id) && item.status === 'draft';
}

export function editorCanSeeEvent(actor, item) {
  return canEditEvent(actor, item) || allows(actor.roles, 'content.update.any');
}

const publicEventCondition = "((e.status = 'published' AND (e.published_at IS NULL OR e.published_at <= ?)) OR (e.status = 'scheduled' AND e.published_at IS NOT NULL AND e.published_at <= ?))";

export async function promoteScheduledEvents(pool, clock = () => Date.now()) {
  const now = sqlTime(clock());
  const [due] = await pool.execute(
    "SELECT id FROM events WHERE status = 'scheduled' AND deleted_at IS NULL AND published_at IS NOT NULL AND published_at <= ?",
    [now]
  );
  if (due.length) {
    const ids = due.map(r => Number(r.id));
    await pool.execute(
      `UPDATE events SET status = 'published', updated_at = ? WHERE status = 'scheduled' AND id IN (${ids.map(() => '?').join(',')})`,
      [now, ...ids]
    );
  }
  return due.length;
}

export async function getEvent(pool, id, clock = () => Date.now()) {
  const [item] = await loadEvents(pool, 'e.id = ? AND e.deleted_at IS NULL', [Number(id)], clock());
  if (!item) throw fail(404, 'That event was not found.');
  return item;
}

export async function getEventBySlug(pool, slug, {includeDrafts = false, clock = () => Date.now()} = {}) {
  await promoteScheduledEvents(pool, clock);
  const nowSql = sqlTime(clock());
  const where = includeDrafts
    ? 'e.slug = ? AND e.deleted_at IS NULL'
    : `e.slug = ? AND e.deleted_at IS NULL AND ${publicEventCondition}`;
  const params = includeDrafts ? [cleanStr(slug, 220)] : [cleanStr(slug, 220), nowSql, nowSql];
  const [item] = await loadEvents(pool, where, params, clock());
  return item ?? null;
}

export async function suppressedEventSlugs(pool, clock = () => Date.now()) {
  if (!pool) return [];
  const nowSql = sqlTime(clock());
  const [rows] = await pool.execute(
    `SELECT slug FROM events WHERE deleted_at IS NOT NULL OR NOT ${publicEventCondition.replaceAll('e.', '')}`,
    [nowSql, nowSql]
  );
  return rows.map(r => r.slug);
}

export async function listEventsStore(pool, {
  status,
  schedule,
  q,
  category,
  includeDrafts = false,
  page = 1,
  pageSize = 50,
  sort = 'event_date_desc',
  clock = () => Date.now(),
} = {}) {
  await promoteScheduledEvents(pool, clock);
  const where = ['e.deleted_at IS NULL'];
  const params = [];
  const nowMs = clock();
  const nowSql = sqlTime(nowMs);

  if (!includeDrafts) {
    where.push(publicEventCondition);
    params.push(nowSql, nowSql);
  } else if (status === 'cancelled') {
    where.push('e.cancelled = 1');
  } else if (status && status !== 'all') {
    if (!writableStatuses.has(status)) throw fail(400, 'Unknown status.');
    where.push('e.status = ?');
    params.push(status);
  }

  if (q) {
    const like = likeContains(q);
    where.push("(e.title LIKE ? ESCAPE '!' OR e.summary LIKE ? ESCAPE '!' OR e.venue LIKE ? ESCAPE '!' OR e.programme_label LIKE ? ESCAPE '!')");
    params.push(like, like, like, like);
  }

  if (category) {
    where.push('EXISTS (SELECT 1 FROM event_terms et JOIN terms t ON t.id = et.term_id WHERE et.event_id = e.id AND (t.slug = ? OR t.name = ?))');
    params.push(category, category);
  }

  const orders = {
    event_date_desc: "CASE WHEN e.event_date = '' AND e.starts_at IS NULL THEN 1 ELSE 0 END ASC, COALESCE(NULLIF(e.event_date, ''), DATE_FORMAT(e.starts_at, '%Y-%m-%d')) DESC, e.id DESC",
    event_date_asc: "CASE WHEN e.event_date = '' AND e.starts_at IS NULL THEN 1 ELSE 0 END ASC, COALESCE(NULLIF(e.event_date, ''), DATE_FORMAT(e.starts_at, '%Y-%m-%d')) ASC, e.id ASC",
    updated: 'e.updated_at DESC, e.id DESC',
    title: 'e.title ASC, e.id DESC',
  };
  const order = orders[sort] || orders.event_date_desc;
  const size = Math.min(Math.max(Number(pageSize) || 50, 1), 100);
  const current = Math.max(Number(page) || 1, 1);

  const [countRows] = await pool.execute(`SELECT COUNT(*) AS n FROM events e WHERE ${where.join(' AND ')}`, params);
  let items = await loadEvents(pool, `${where.join(' AND ')} ORDER BY ${order} LIMIT ${size} OFFSET ${(current - 1) * size}`, params, nowMs);

  if (schedule && schedule !== 'all') {
    items = items.filter(item => {
      if (schedule === 'upcoming') return item.scheduleState === 'upcoming' || item.scheduleState === 'ongoing';
      if (schedule === 'past') return item.scheduleState === 'past';
      if (schedule === 'cancelled') return item.scheduleState === 'cancelled';
      if (schedule === 'unannounced') return item.scheduleState === 'unannounced';
      return true;
    });
  }

  let counts = null;
  if (includeDrafts) {
    const [rows] = await pool.execute('SELECT e.status, COUNT(*) AS n FROM events e WHERE e.deleted_at IS NULL GROUP BY e.status');
    const [[cancelledRow]] = await pool.execute('SELECT COUNT(*) AS n FROM events e WHERE e.deleted_at IS NULL AND e.cancelled = 1');
    counts = Object.fromEntries(rows.map(row => [row.status, Number(row.n)]));
    counts.cancelled = Number(cancelledRow?.n ?? 0);
  }

  return {
    items,
    total: Number(countRows[0].n),
    page: current,
    pageSize: size,
    ...(counts ? {counts} : {}),
  };
}

function parseOptionalSqlDateTime(raw, label) {
  if (raw === undefined || raw === null || raw === '') return null;
  const text = String(raw).trim();
  if (!text) return null;
  const when = Date.parse(text.includes('T') ? text : `${text.replace(' ', 'T')}Z`);
  if (!Number.isFinite(when)) throw fail(400, `Enter a valid ${label}.`);
  return {ms: when, sql: sqlTime(when), iso: new Date(when).toISOString()};
}

function eventInput(input, current) {
  const title = cleanStr(input.title ?? current?.title ?? '', 260);
  const summary = cleanStr(input.summary ?? input.excerpt ?? current?.summary ?? '', 500);
  const slug = slugify(input.slug || current?.slug || title);
  if (title.length < 2) throw fail(400, 'Enter an event title.');
  if (!slug) throw fail(400, 'Enter a URL slug.');

  let sourceDoc = input.document !== undefined
    ? input.document
    : input.body !== undefined
      ? input.body
      : Array.isArray(input.details)
        ? plainDocument(input.details.join('\n\n'))
        : current?.document ?? '';

  const document = normalizeDocument(sourceDoc);
  const html = documentHtml(document);

  const startsParsed = parseOptionalSqlDateTime(
    input.startsAt !== undefined ? input.startsAt : current?.startsAt,
    'start date and time'
  );
  const endsParsed = parseOptionalSqlDateTime(
    input.endsAt !== undefined ? input.endsAt : current?.endsAt,
    'end date and time'
  );
  if (startsParsed && endsParsed && endsParsed.ms < startsParsed.ms) {
    throw fail(400, 'End date/time cannot be earlier than the start date/time.');
  }

  const rawEventDate = input.eventDate !== undefined
    ? input.eventDate
    : (input.date !== undefined ? input.date : current?.eventDate ?? '');
  const eventDate = normalizeDateString(rawEventDate, startsParsed?.iso ?? '');

  const regOpenParsed = parseOptionalSqlDateTime(
    input.registrationOpenAt !== undefined ? input.registrationOpenAt : current?.registrationOpenAt,
    'registration opening date/time'
  );
  const regCloseParsed = parseOptionalSqlDateTime(
    input.registrationCloseAt !== undefined ? input.registrationCloseAt : current?.registrationCloseAt,
    'registration closing date/time'
  );
  if (regOpenParsed && regCloseParsed && regCloseParsed.ms < regOpenParsed.ms) {
    throw fail(400, 'Registration closing date/time cannot be earlier than the opening date/time.');
  }

  const format = EVENT_FORMATS.includes(input.format) ? input.format : (current?.format || 'physical');
  const registrationMode = REGISTRATION_MODES.includes(input.registrationMode)
    ? input.registrationMode
    : (current?.registrationMode || 'none');
  const meetingAccess = MEETING_ACCESS_MODES.includes(input.meetingAccess)
    ? input.meetingAccess
    : (current?.meetingAccess || 'private');

  const timezone = cleanStr(input.timezone ?? current?.timezone ?? 'Africa/Accra', 80) || 'Africa/Accra';
  const timeLabel = cleanStr(input.timeLabel ?? current?.timeLabel ?? '', 160);
  const venue = cleanStr(input.venue ?? current?.venue ?? '', 240);
  const organiser = cleanStr(input.organiser ?? current?.organiser ?? 'Foreign Africa', 180) || 'Foreign Africa';
  const locationAddress = cleanStr(input.locationAddress ?? current?.locationAddress ?? '', 360);
  const onlinePlatform = cleanStr(input.onlinePlatform ?? current?.onlinePlatform ?? '', 120);
  const meetingUrl = safeUrl(input.meetingUrl ?? current?.meetingUrl ?? '', 500);
  const imageFit = ['cover', 'contain'].includes(input.imageFit) ? input.imageFit : (current?.imageFit || 'cover');

  const gallery = input.gallery !== undefined ? normalizeGallery(input.gallery) : (current?.gallery ?? []);
  const speakers = input.speakers !== undefined ? normalizeSpeakers(input.speakers) : (current?.speakers ?? []);
  const agenda = input.agenda !== undefined ? normalizeAgenda(input.agenda) : (current?.agenda ?? []);
  const documents = input.documents !== undefined ? normalizeDocuments(input.documents) : (current?.documents ?? []);

  const programmeId = cleanStr(input.programmeId ?? current?.programmeId ?? '', 120);
  const programmeLabel = cleanStr(input.programmeLabel ?? current?.programmeLabel ?? '', 180);
  const storyUrl = safeUrl(input.storyUrl ?? current?.storyUrl ?? '', 500);
  const sourceLabel = cleanStr(input.sourceLabel ?? current?.sourceLabel ?? '', 180);
  const sourceUrl = safeUrl(input.sourceUrl ?? current?.sourceUrl ?? '', 500);
  const recordingUrl = safeUrl(input.recordingUrl ?? current?.recordingUrl ?? '', 500);

  const registrationUrl = safeUrl(input.registrationUrl ?? current?.registrationUrl ?? '', 500);
  const registrationFormKey = cleanStr(input.registrationFormKey ?? current?.registrationFormKey ?? '', 80);
  const registrationClosed = input.registrationClosed === undefined ? Boolean(current?.registrationClosed) : Boolean(input.registrationClosed);
  const registrationLabel = cleanStr(input.registrationLabel ?? current?.registrationLabel ?? '', 120);

  const cancelled = input.cancelled === undefined ? Boolean(current?.cancelled) : Boolean(input.cancelled);
  const cancellationNote = cleanStr(input.cancellationNote ?? current?.cancellationNote ?? '', 400);
  const featured = input.featured === undefined ? Boolean(current?.featured) : Boolean(input.featured);
  const seoTitle = cleanStr(input.seoTitle ?? current?.seoTitle ?? '', 260);
  const seoDescription = cleanStr(input.seoDescription ?? current?.seoDescription ?? '', 500);
  const authorName = cleanStr(input.authorName ?? current?.authorName ?? 'Foreign Africa', 180);
  const category = cleanStr(input.category ?? current?.category ?? programmeLabel ?? 'Event', 160);
  const tags = [...new Set((input.tags ?? current?.tags ?? []).map(tag => String(tag).trim()).filter(Boolean))].slice(0, 20).map(tag => tag.slice(0, 80));

  return {
    title,
    slug,
    summary,
    document,
    html,
    startsAtSql: startsParsed?.sql ?? null,
    startsAtIso: startsParsed?.iso ?? null,
    endsAtSql: endsParsed?.sql ?? null,
    endsAtIso: endsParsed?.iso ?? null,
    eventDate,
    timezone,
    timeLabel,
    format,
    venue,
    organiser,
    locationAddress,
    onlinePlatform,
    meetingUrl,
    meetingAccess,
    imageFit,
    gallery,
    speakers,
    agenda,
    documents,
    programmeId,
    programmeLabel,
    storyUrl,
    sourceLabel,
    sourceUrl,
    recordingUrl,
    registrationMode,
    registrationUrl,
    registrationFormKey,
    registrationOpenAtSql: regOpenParsed?.sql ?? null,
    registrationOpenAtIso: regOpenParsed?.iso ?? null,
    registrationCloseAtSql: regCloseParsed?.sql ?? null,
    registrationCloseAtIso: regCloseParsed?.iso ?? null,
    registrationClosed,
    registrationLabel,
    cancelled,
    cancellationNote,
    featured,
    seoTitle,
    seoDescription,
    authorName,
    category,
    tags,
  };
}

function eventPublicationTime(input, current, status, clock) {
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

async function saveEventRevision(pool, clock, eventId, editorId, fields, status, note = '') {
  const [[row]] = await pool.execute('SELECT COALESCE(MAX(revision_number), 0) AS max_rev FROM event_revisions WHERE event_id = ?', [eventId]);
  const nextRev = Number(row?.max_rev ?? 0) + 1;
  const snapshot = {
    ...fields,
    status,
  };
  await pool.execute(
    `INSERT INTO event_revisions (event_id, revision_number, title, summary, body_json, body_html, snapshot_json, editor_id, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      eventId,
      nextRev,
      fields.title,
      fields.summary,
      JSON.stringify(fields.document),
      fields.html,
      JSON.stringify(snapshot),
      editorId ?? null,
      cleanStr(note, 240),
      sqlTime(clock()),
    ]
  );
}

async function writeEvent(pool, clock, actor, id, input, current) {
  const fields = eventInput(input, current);
  let status = input.status ?? current?.status ?? 'draft';
  if (!writableStatuses.has(status)) throw fail(400, 'Unknown status.');
  if (!allows(actor.roles, 'content.publish')) status = 'draft';

  const featuredMediaId = await mediaId(pool, input.featuredMediaId, current?.featuredMediaId);
  const socialImageId = await mediaId(pool, input.socialImageId, current?.socialImageId);
  const publishedAt = eventPublicationTime(input, current, id ? status : (input.status === 'published' && allows(actor.roles, 'content.publish') ? 'published' : 'draft'), clock);
  const now = sqlTime(clock());

  try {
    if (!id) {
      const initialStatus = input.status && allows(actor.roles, 'content.publish') && writableStatuses.has(input.status) ? input.status : 'draft';
      const [result] = await pool.execute(
        `INSERT INTO events (
          title, slug, summary, body_html, body_json,
          starts_at, event_date, ends_at, timezone, time_label,
          format, venue, organiser, location_address, online_platform, meeting_url, meeting_access,
          featured_media_id, image_fit, social_image_id,
          gallery_json, speakers_json, agenda_json, documents_json,
          programme_id, programme_label, story_url, source_label, source_url, recording_url,
          registration_mode, registration_url, registration_form_key,
          registration_open_at, registration_close_at, registration_closed, registration_label,
          status, cancelled, cancellation_note, published_at, featured,
          seo_title, seo_description, author_id, author_name, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?
        )`,
        [
          fields.title,
          fields.slug,
          fields.summary,
          fields.html,
          JSON.stringify(fields.document),
          fields.startsAtSql,
          fields.eventDate,
          fields.endsAtSql,
          fields.timezone,
          fields.timeLabel,
          fields.format,
          fields.venue,
          fields.organiser,
          fields.locationAddress,
          fields.onlinePlatform,
          fields.meetingUrl,
          fields.meetingAccess,
          featuredMediaId,
          fields.imageFit,
          socialImageId,
          JSON.stringify(fields.gallery),
          JSON.stringify(fields.speakers),
          JSON.stringify(fields.agenda),
          JSON.stringify(fields.documents),
          fields.programmeId,
          fields.programmeLabel,
          fields.storyUrl,
          fields.sourceLabel,
          fields.sourceUrl,
          fields.recordingUrl,
          fields.registrationMode,
          fields.registrationUrl,
          fields.registrationFormKey,
          fields.registrationOpenAtSql,
          fields.registrationCloseAtSql,
          fields.registrationClosed ? 1 : 0,
          fields.registrationLabel,
          initialStatus,
          fields.cancelled ? 1 : 0,
          fields.cancellationNote,
          publishedAt,
          fields.featured ? 1 : 0,
          fields.seoTitle,
          fields.seoDescription,
          actor?.id ?? null,
          fields.authorName,
          now,
          now,
        ]
      );
      id = result.insertId;
      status = initialStatus;
    } else {
      await pool.execute(
        `UPDATE events SET
          title = ?, slug = ?, summary = ?, body_html = ?, body_json = ?,
          starts_at = ?, event_date = ?, ends_at = ?, timezone = ?, time_label = ?,
          format = ?, venue = ?, organiser = ?, location_address = ?, online_platform = ?, meeting_url = ?, meeting_access = ?,
          featured_media_id = ?, image_fit = ?, social_image_id = ?,
          gallery_json = ?, speakers_json = ?, agenda_json = ?, documents_json = ?,
          programme_id = ?, programme_label = ?, story_url = ?, source_label = ?, source_url = ?, recording_url = ?,
          registration_mode = ?, registration_url = ?, registration_form_key = ?,
          registration_open_at = ?, registration_close_at = ?, registration_closed = ?, registration_label = ?,
          status = ?, cancelled = ?, cancellation_note = ?, published_at = ?, featured = ?,
          seo_title = ?, seo_description = ?, author_name = ?, updated_at = ?
         WHERE id = ?`,
        [
          fields.title,
          fields.slug,
          fields.summary,
          fields.html,
          JSON.stringify(fields.document),
          fields.startsAtSql,
          fields.eventDate,
          fields.endsAtSql,
          fields.timezone,
          fields.timeLabel,
          fields.format,
          fields.venue,
          fields.organiser,
          fields.locationAddress,
          fields.onlinePlatform,
          fields.meetingUrl,
          fields.meetingAccess,
          featuredMediaId,
          fields.imageFit,
          socialImageId,
          JSON.stringify(fields.gallery),
          JSON.stringify(fields.speakers),
          JSON.stringify(fields.agenda),
          JSON.stringify(fields.documents),
          fields.programmeId,
          fields.programmeLabel,
          fields.storyUrl,
          fields.sourceLabel,
          fields.sourceUrl,
          fields.recordingUrl,
          fields.registrationMode,
          fields.registrationUrl,
          fields.registrationFormKey,
          fields.registrationOpenAtSql,
          fields.registrationCloseAtSql,
          fields.registrationClosed ? 1 : 0,
          fields.registrationLabel,
          status,
          fields.cancelled ? 1 : 0,
          fields.cancellationNote,
          publishedAt,
          fields.featured ? 1 : 0,
          fields.seoTitle,
          fields.seoDescription,
          fields.authorName,
          now,
          id,
        ]
      );
    }
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw fail(409, 'That slug is already used by another event.');
    throw error;
  }

  await setEventTerms(pool, id, fields.category, fields.tags);
  await saveEventRevision(pool, clock, id, actor?.id, {...fields, featuredMediaId, socialImageId}, status, input.revisionNote || '');
  return {id, fields, status};
}

export async function createEvent({pool, clock = () => Date.now(), actor, input}) {
  if (!allows(actor.roles, 'content.publish') && input.status && input.status !== 'draft') {
    throw fail(403, 'You do not have permission to publish.');
  }
  const written = await writeEvent(pool, clock, actor, null, {...input, status: input.status || 'draft'}, null);
  await recordActivity(pool, clock, {
    actorId: actor.id,
    action: written.status === 'published' ? 'event.published' : 'event.created',
    subjectType: 'event',
    subjectId: written.id,
    metadata: {slug: written.fields.slug, status: written.status},
  });
  return getEvent(pool, written.id, clock);
}

export async function updateEvent({pool, clock = () => Date.now(), actor, id, input}) {
  const current = await getEvent(pool, id, clock);
  if (!canEditEvent(actor, current)) throw fail(403, 'You cannot edit that event.');
  const written = await writeEvent(pool, clock, actor, id, input, current);
  const action = written.fields.cancelled && !current.cancelled
    ? 'event.cancelled'
    : written.status === current.status
      ? 'event.updated'
      : written.status === 'published'
        ? 'event.published'
        : written.status === 'archived'
          ? 'event.archived'
          : written.status === 'draft'
            ? 'event.unpublished'
            : 'event.updated';
  await recordActivity(pool, clock, {
    actorId: actor.id,
    action,
    subjectType: 'event',
    subjectId: id,
    metadata: {slug: written.fields.slug, status: written.status, cancelled: written.fields.cancelled},
  });
  return getEvent(pool, id, clock);
}

export async function setEventState({pool, clock = () => Date.now(), actor, id, status, publishedAt, cancelled, cancellationNote}) {
  if (!allows(actor.roles, 'content.publish')) throw fail(403, 'You do not have permission to publish or change event state.');
  const patch = {};
  if (status !== undefined) patch.status = status;
  if (publishedAt !== undefined) patch.publishedAt = publishedAt;
  if (cancelled !== undefined) patch.cancelled = cancelled;
  if (cancellationNote !== undefined) patch.cancellationNote = cancellationNote;
  return updateEvent({pool, clock, actor, id, input: patch});
}

export async function deleteEvent({pool, clock = () => Date.now(), actor, id}) {
  if (!allows(actor.roles, 'content.delete')) throw fail(403, 'You do not have permission to delete that event.');
  await getEvent(pool, id, clock);
  await pool.execute('UPDATE events SET deleted_at = ?, updated_at = ? WHERE id = ?', [sqlTime(clock()), sqlTime(clock()), id]);
  await recordActivity(pool, clock, {actorId: actor.id, action: 'event.deleted', subjectType: 'event', subjectId: id, metadata: {}});
}

export const eventBulkActions = {
  publish: {status: 'published'},
  unpublish: {status: 'draft'},
  archive: {status: 'archived'},
  cancel: {cancelled: true},
  uncancel: {cancelled: false},
};

export async function bulkEvents({pool, clock = () => Date.now(), actor, action, ids}) {
  if (!(action in eventBulkActions) && action !== 'delete') throw fail(400, 'Choose a bulk action.');
  if (!Array.isArray(ids) || !ids.length || ids.length > 50) throw fail(400, 'Select between 1 and 50 events.');
  const unique = [...new Set(ids.map(Number))];
  if (unique.some(id => !Number.isInteger(id) || id < 1)) throw fail(400, 'Select valid events.');
  const results = [];
  for (const id of unique) {
    try {
      if (action === 'delete') await deleteEvent({pool, clock, actor, id});
      else await setEventState({pool, clock, actor, id, ...eventBulkActions[action]});
      results.push({id, ok: true});
    } catch (error) {
      if (!error.status || error.status >= 500) throw error;
      results.push({id, ok: false, error: error.message});
    }
  }
  await recordActivity(pool, clock, {
    actorId: actor.id,
    action: 'event.bulk',
    subjectType: 'event',
    subjectId: '',
    metadata: {action, requested: unique.length, succeeded: results.filter(r => r.ok).length},
  });
  return results;
}

export async function duplicateEvent({pool, clock = () => Date.now(), actor, id}) {
  const current = await getEvent(pool, id, clock);
  if (!canEditEvent(actor, current) && !allows(actor.roles, 'content.read')) throw fail(403, 'You cannot copy that event.');
  if (!allows(actor.roles, 'content.update.any') && Number(current.authorId) !== Number(actor.id)) throw fail(403, 'You cannot copy that event.');
  let candidateSlug = `${current.slug}-copy`;
  let counter = 2;
  while (true) {
    const [rows] = await pool.execute('SELECT id FROM events WHERE slug = ? LIMIT 1', [candidateSlug]);
    if (!rows.length) break;
    candidateSlug = `${current.slug}-copy-${counter++}`;
  }
  const copy = await createEvent({
    pool,
    clock,
    actor,
    input: {
      ...current,
      title: `${current.title} (Copy)`,
      slug: candidateSlug,
      status: 'draft',
      cancelled: false,
      cancellationNote: '',
      featured: false,
      publishedAt: null,
      revisionNote: `Duplicated from #${id}`,
    },
  });
  await recordActivity(pool, clock, {actorId: actor.id, action: 'event.duplicated', subjectType: 'event', subjectId: copy.id, metadata: {from: id}});
  return copy;
}

export async function eventRevisions(pool, id) {
  await getEvent(pool, id);
  const [rows] = await pool.execute(
    `SELECT r.id, r.revision_number, r.editor_id, u.name AS editor_name, r.title, r.summary, r.body_json, r.snapshot_json, r.note, r.created_at
     FROM event_revisions r
     LEFT JOIN users u ON u.id = r.editor_id
     WHERE r.event_id = ?
     ORDER BY r.id DESC LIMIT 30`,
    [Number(id)]
  );
  return rows.map(row => {
    const snapshot = parseJson(row.snapshot_json, {});
    const doc = parseJson(row.body_json, snapshot.document ?? null);
    let text = '';
    try { text = documentText(normalizeDocument(doc ?? '')); } catch { text = row.summary || ''; }
    return {
      id: Number(row.id),
      revisionNumber: Number(row.revision_number),
      editorId: row.editor_id ? Number(row.editor_id) : null,
      editorName: row.editor_name || 'Staff',
      createdAt: isoTime(row.created_at),
      title: row.title || snapshot.title || '',
      note: row.note || '',
      text,
      snapshot,
    };
  });
}

export async function restoreEventRevision({pool, clock = () => Date.now(), actor, eventId, revisionId}) {
  if (!allows(actor.roles, 'content.update.any')) throw fail(403, 'You cannot restore that revision.');
  const [rows] = await pool.execute('SELECT * FROM event_revisions WHERE id = ? AND event_id = ?', [Number(revisionId), Number(eventId)]);
  if (!rows[0]) throw fail(404, 'That revision was not found.');
  const rev = rows[0];
  const snapshot = parseJson(rev.snapshot_json, {});
  const doc = parseJson(rev.body_json, snapshot.document ?? '');
  const item = await updateEvent({
    pool,
    clock,
    actor,
    id: Number(eventId),
    input: {
      ...snapshot,
      title: rev.title || snapshot.title,
      summary: rev.summary ?? snapshot.summary,
      document: doc,
      startsAt: snapshot.startsAtIso ?? snapshot.startsAt ?? null,
      endsAt: snapshot.endsAtIso ?? snapshot.endsAt ?? null,
      registrationOpenAt: snapshot.registrationOpenAtIso ?? snapshot.registrationOpenAt ?? null,
      registrationCloseAt: snapshot.registrationCloseAtIso ?? snapshot.registrationCloseAt ?? null,
      status: 'draft',
      revisionNote: `Restored revision #${rev.revision_number}`,
    },
  });
  await recordActivity(pool, clock, {actorId: actor.id, action: 'event.restored', subjectType: 'event', subjectId: eventId, metadata: {revisionId}});
  return item;
}

// ============================================================================
// DATABASE-BACKED FORMS (Reusable across Events & Public Enquiries)
// ============================================================================

function normalizeFormFields(fields) {
  if (!Array.isArray(fields)) return [];
  return fields
    .map(field => {
      const key = cleanStr(field?.id || field?.name || '', 64).replace(/[^a-zA-Z0-9_-]/g, '_');
      return {
        id: key,
        name: key,
        label: cleanStr(field?.label ?? '', 180),
        type: ['text', 'email', 'tel', 'url', 'textarea', 'select'].includes(field?.type) ? field.type : 'text',
        required: Boolean(field?.required),
        maxLength: Math.min(20000, Math.max(1, Number(field?.maxLength) || 240)),
        ...(Array.isArray(field?.options) ? {options: field.options.map(o => cleanStr(o, 140)).filter(Boolean)} : {}),
      };
    })
    .filter(field => field.id && field.label);
}

function rowToForm(row) {
  const fields = normalizeFormFields(parseJson(row.fields_json, []));
  const successMsg = row.success_message || 'Thank you. Your submission has been received.';
  return {
    id: row.form_key,
    dbId: Number(row.id),
    formKey: row.form_key,
    purpose: row.purpose || row.form_key,
    title: row.title,
    intro: row.description || '',
    description: row.description || '',
    recipientEmail: row.recipient_email || '',
    success: successMsg,
    successMessage: successMsg,
    consentLabel: row.consent_label || 'I agree that Foreign Africa may process these details to respond to my submission.',
    status: row.status || 'published',
    fields,
    updatedAt: isoTime(row.updated_at),
  };
}

export async function listFormsDb(pool, {onlyPublished = false} = {}) {
  if (!pool) return [];
  const where = ['deleted_at IS NULL'];
  if (onlyPublished) where.push("status = 'published'");
  const [rows] = await pool.query(`SELECT * FROM forms WHERE ${where.join(' AND ')} ORDER BY title ASC`);
  return rows.map(rowToForm);
}

export async function getFormDb(pool, formKey, {onlyPublished = false} = {}) {
  if (!pool || !formKey) return null;
  const where = ['form_key = ?', 'deleted_at IS NULL'];
  if (onlyPublished) where.push("status = 'published'");
  const [rows] = await pool.query(`SELECT * FROM forms WHERE ${where.join(' AND ')} LIMIT 1`, [cleanStr(formKey, 80)]);
  return rows.length ? rowToForm(rows[0]) : null;
}

export async function saveFormDb({pool, clock = () => Date.now(), actor, input}) {
  const rawKey = cleanStr(input.formKey || input.id || slugify(input.title || 'form'), 80).replace(/-/g, '_');
  if (!rawKey) throw fail(400, 'Form key is required.');
  const title = cleanStr(input.title || 'Untitled Form', 180);
  const purpose = cleanStr(input.purpose || rawKey, 80);
  const description = cleanStr(input.description ?? input.intro ?? '', 500);
  const recipientEmail = cleanStr(input.recipientEmail ?? '', 190);
  const successMessage = cleanStr(input.successMessage || 'Thank you. Your submission has been received.', 400);
  const consentLabel = cleanStr(input.consentLabel || 'I agree that Foreign Africa may process these details to respond to my submission.', 360);
  const status = writableStatuses.has(input.status) ? input.status : 'published';
  const fields = normalizeFormFields(input.fields);
  if (!fields.length) throw fail(400, 'Add at least one field to the form.');

  const now = sqlTime(clock());
  const existing = await getFormDb(pool, rawKey);
  if (existing) {
    await pool.execute(
      `UPDATE forms SET purpose = ?, title = ?, description = ?, recipient_email = ?, success_message = ?, consent_label = ?, fields_json = ?, status = ?, updated_at = ?
       WHERE form_key = ?`,
      [purpose, title, description, recipientEmail, successMessage, consentLabel, JSON.stringify(fields), status, now, rawKey]
    );
  } else {
    await pool.execute(
      `INSERT INTO forms (form_key, purpose, title, description, recipient_email, success_message, consent_label, fields_json, status, author_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [rawKey, purpose, title, description, recipientEmail, successMessage, consentLabel, JSON.stringify(fields), status, actor?.id ?? null, now, now]
    );
  }

  await recordActivity(pool, clock, {
    actorId: actor?.id ?? null,
    action: existing ? 'form.updated' : 'form.created',
    subjectType: 'form',
    subjectId: rawKey,
    metadata: {formKey: rawKey, title, status},
  });

  return getFormDb(pool, rawKey);
}

// ============================================================================
// PUBLIC VIEW SERIALIZATION (Security-Filtered for Public Endpoints)
// ============================================================================

export async function publicEventView(pool, item, clock = () => Date.now(), fallbackForms = []) {
  if (!item) return null;
  const nowMs = clock();
  let attachedForm = null;
  let formPublished = true;

  if (item.registrationMode === 'form' && item.registrationFormKey) {
    let dbForm = pool ? await getFormDb(pool, item.registrationFormKey, {onlyPublished: false}) : null;
    if (!dbForm && Array.isArray(fallbackForms)) {
      const f = fallbackForms.find(entry => entry.id === item.registrationFormKey);
      if (f) dbForm = {...f, status: f.status || 'published'};
    }
    if (dbForm) {
      formPublished = dbForm.status === 'published';
      if (formPublished) {
        attachedForm = {
          id: dbForm.id || dbForm.formKey,
          title: dbForm.title,
          intro: dbForm.intro || dbForm.description || '',
          consentLabel: dbForm.consentLabel,
          successMessage: dbForm.successMessage,
          fields: dbForm.fields,
        };
      }
    } else {
      formPublished = false;
    }
  }

  const scheduleState = computeEventScheduleState(item, nowMs);
  const registrationStatus = computeRegistrationState(item, nowMs, formPublished);
  // Private or registered_only meeting URLs are strictly withheld from public API responses
  const publicMeetingUrl = item.meetingAccess === 'public' ? item.meetingUrl : '';

  return {
    id: item.slug,
    dbId: item.id,
    type: 'event',
    slug: item.slug,
    title: item.title,
    summary: item.summary,
    html: item.html,
    details: item.details,
    date: item.eventDate || null,
    eventDate: item.eventDate || null,
    startsAt: item.startsAt || null,
    endsAt: item.endsAt || null,
    timezone: item.timezone || 'Africa/Accra',
    timeLabel: item.timeLabel || '',
    format: item.format || 'physical',
    venue: item.venue || '',
    organiser: item.organiser || 'Foreign Africa',
    locationAddress: item.locationAddress || '',
    onlinePlatform: item.onlinePlatform || '',
    meetingUrl: publicMeetingUrl,
    meetingAccess: item.meetingAccess || 'private',
    meetingRestricted: Boolean(item.meetingUrl && item.meetingAccess !== 'public'),
    image: item.image || '',
    imageAlt: item.imageAlt || item.title,
    imageFit: item.imageFit || 'cover',
    socialImage: item.socialImage || item.image || '',
    gallery: item.gallery || [],
    speakers: item.speakers || [],
    agenda: item.agenda || [],
    documents: item.documents || [],
    programmeId: item.programmeId || '',
    programmeLabel: item.programmeLabel || '',
    storyUrl: item.storyUrl || '',
    sourceLabel: item.sourceLabel || '',
    sourceUrl: item.sourceUrl || '',
    recordingUrl: item.recordingUrl || '',
    registrationMode: item.registrationMode || 'none',
    registrationUrl: registrationStatus.open && item.registrationMode === 'url' ? item.registrationUrl : '',
    registrationFormKey: item.registrationFormKey || '',
    registrationOpenAt: item.registrationOpenAt || null,
    registrationCloseAt: item.registrationCloseAt || null,
    registrationClosed: Boolean(item.registrationClosed),
    registrationLabel: item.registrationLabel || 'Register for event',
    registrationStatus,
    registrationForm: registrationStatus.open && item.registrationMode === 'form' ? attachedForm : null,
    status: item.status,
    cancelled: Boolean(item.cancelled),
    cancellationNote: item.cancellationNote || '',
    scheduleState,
    featured: Boolean(item.featured),
    category: item.category || 'Event',
    tags: item.tags || [],
    seoTitle: item.seoTitle || item.title,
    seoDescription: item.seoDescription || item.summary,
    publishedAt: item.publishedAt,
    updatedAt: item.updatedAt,
  };
}

// ============================================================================
// IDEMPOTENT SEEDING FROM data/cms/events.json & data/cms/forms.json
// ============================================================================

export async function seedEventsAndForms({
  pool,
  directory = process.cwd(),
  actor = {id: null, roles: ['super_admin']},
  clock = () => Date.now(),
}) {
  const dataDir = join(directory, 'data', 'cms');
  const report = {
    eventsInserted: [],
    eventsExisting: [],
    formsInserted: [],
    formsExisting: [],
  };

  // 1. Seed forms from data/cms/forms.json without overwriting existing DB forms
  const formsFile = join(dataDir, 'forms.json');
  if (existsSync(formsFile)) {
    const rawForms = parseJson(readFileSync(formsFile, 'utf8'), []);
    for (const f of rawForms) {
      const formKey = cleanStr(f.id || f.formKey, 80);
      if (!formKey) continue;
      const existing = await getFormDb(pool, formKey);
      if (existing) {
        report.formsExisting.push(formKey);
        continue;
      }
      await saveFormDb({
        pool,
        clock,
        actor,
        input: {
          formKey,
          purpose: f.purpose || formKey,
          title: f.title || formKey,
          description: f.intro || f.description || '',
          successMessage: f.successMessage || 'Thank you. Your submission has been received.',
          consentLabel: f.consentLabel || 'I agree that Foreign Africa may process these details to respond to my submission.',
          status: 'published',
          fields: f.fields || [],
        },
      });
      report.formsInserted.push(formKey);
    }
  }

  // 2. Seed events from data/cms/events.json without overwriting existing DB events
  const eventsFile = join(dataDir, 'events.json');
  if (existsSync(eventsFile)) {
    const rawEvents = parseJson(readFileSync(eventsFile, 'utf8'), []);
    for (const ev of rawEvents) {
      const slug = slugify(ev.id || ev.title);
      if (!slug) continue;
      const [existingRows] = await pool.execute('SELECT id FROM events WHERE slug = ? LIMIT 1', [slug]);
      if (existingRows.length) {
        report.eventsExisting.push(slug);
        continue;
      }

      const mediaIdVal = ev.image
        ? await registerSiteFile({pool, clock, actorId: actor?.id ?? null, publicPath: ev.image})
        : null;

      await createEvent({
        pool,
        clock,
        actor: {...actor, roles: actor?.roles?.length ? actor.roles : ['super_admin']},
        input: {
          title: ev.title,
          slug,
          summary: ev.summary || '',
          details: Array.isArray(ev.details) ? ev.details : (ev.summary ? [ev.summary] : []),
          eventDate: ev.date || '',
          timezone: 'Africa/Accra',
          timeLabel: ev.timeLabel || '',
          format: ev.venue && /online|virtual|zoom/i.test(ev.venue) ? 'virtual' : 'physical',
          venue: ev.venue || '',
          organiser: 'Foreign Africa',
          featuredMediaId: mediaIdVal,
          imageFit: ev.imageFit === 'contain' ? 'contain' : 'cover',
          programmeLabel: ev.category || '',
          storyUrl: ev.storyUrl || '',
          sourceLabel: ev.sourceLabel || '',
          sourceUrl: ev.sourceUrl || '',
          registrationMode: ev.registrationUrl ? 'url' : 'none',
          registrationUrl: ev.registrationUrl || '',
          status: ev.status === 'draft' ? 'draft' : 'published',
          category: ev.category || 'Event',
          revisionNote: 'Imported from initial Foreign Africa events catalogue',
        },
      });
      report.eventsInserted.push(slug);
    }
  }

  return report;
}
