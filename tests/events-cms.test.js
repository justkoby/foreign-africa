import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeEventScheduleState,
  computeRegistrationState,
  publicEventView,
} from '../server/events-store.js';
import { articleMeta, articleRequest, injectPreviewArticle } from '../server/html.js';
import { statementsFrom } from '../server/migrate.js';
import { resolvePage } from '../src/pages/routes.js';
import { eventState, listEvents } from '../src/pages/news-events-model.js';

const NOW = Date.parse('2026-08-15T12:00:00Z');

test('Task 1 & 2: Migration 008_events_cms.sql defines events columns, event_revisions, event_terms, and forms extensions', () => {
  const sql = readFileSync(join(process.cwd(), 'migrations', '008_events_cms.sql'), 'utf8');
  const statements = statementsFrom(sql);
  assert.equal(statements.length, 4);
  assert.match(statements[0], /ALTER TABLE events/i);
  assert.match(statements[0], /ADD COLUMN body_json JSON/i);
  assert.match(statements[0], /ADD COLUMN event_date VARCHAR/i);
  assert.match(statements[0], /ADD COLUMN timezone VARCHAR/i);
  assert.match(statements[0], /ADD COLUMN format ENUM\('physical', 'virtual', 'hybrid'\)/i);
  assert.match(statements[0], /ADD COLUMN meeting_access ENUM\('public', 'registered_only', 'private'\)/i);
  assert.match(statements[0], /ADD COLUMN speakers_json JSON/i);
  assert.match(statements[0], /ADD COLUMN agenda_json JSON/i);
  assert.match(statements[0], /ADD COLUMN documents_json JSON/i);
  assert.match(statements[0], /ADD COLUMN gallery_json JSON/i);
  assert.match(statements[0], /ADD COLUMN registration_form_key VARCHAR/i);
  assert.match(statements[0], /ADD COLUMN registration_open_at DATETIME/i);
  assert.match(statements[0], /ADD COLUMN registration_close_at DATETIME/i);
  assert.match(statements[0], /ADD COLUMN cancelled TINYINT/i);
  assert.match(statements[1], /CREATE TABLE IF NOT EXISTS event_revisions/i);
  assert.match(statements[2], /CREATE TABLE IF NOT EXISTS event_terms/i);
  assert.match(statements[3], /ALTER TABLE forms/i);
  assert.match(statements[3], /ADD COLUMN fields_json JSON/i);
});

test('Task 3 & 6: Event schedule states classify upcoming, ongoing, past, cancelled, and unknown dates accurately', () => {
  // Future event
  assert.equal(
    computeEventScheduleState({ eventDate: '2026-09-10', startsAt: '2026-09-10T09:00:00Z', endsAt: '2026-09-10T12:00:00Z' }, NOW),
    'upcoming'
  );
  // Ongoing event
  assert.equal(
    computeEventScheduleState({ eventDate: '2026-08-15', startsAt: '2026-08-15T10:00:00Z', endsAt: '2026-08-15T14:00:00Z' }, NOW),
    'ongoing'
  );
  // Past event
  assert.equal(
    computeEventScheduleState({ eventDate: '2026-06-01', startsAt: '2026-06-01T10:00:00Z', endsAt: '2026-06-01T14:00:00Z' }, NOW),
    'past'
  );
  // Cancelled event overrides upcoming date
  assert.equal(
    computeEventScheduleState({ eventDate: '2026-11-01', cancelled: true }, NOW),
    'cancelled'
  );
  // Historical event with unknown date does not invent a date
  assert.equal(
    computeEventScheduleState({ eventDate: '', startsAt: null }, NOW),
    'unannounced'
  );

  // Public frontend model compatibility
  const dbEvent = {
    id: 'african-trade-summit-2026',
    slug: 'african-trade-summit-2026',
    title: 'African Trade Summit 2026',
    eventDate: '2026-09-20',
    startsAt: '2026-09-20T09:00:00Z',
    endsAt: '2026-09-20T17:00:00Z',
  };
  assert.equal(eventState(dbEvent, new Date(NOW)), 'upcoming');
  assert.equal(listEvents([dbEvent], 'upcoming', new Date(NOW)).length, 1);
  assert.equal(listEvents([dbEvent], 'past', new Date(NOW)).length, 0);
});

test('Task 4: Registration management respects mode, opening/closing dates, manual close, past events, and cancellation', () => {
  const baseUpcoming = {
    eventDate: '2026-09-20',
    startsAt: '2026-09-20T09:00:00Z',
    endsAt: '2026-09-20T17:00:00Z',
    registrationMode: 'form',
    registrationFormKey: 'event_registration',
    registrationOpenAt: '2026-08-01T00:00:00Z',
    registrationCloseAt: '2026-09-19T23:59:59Z',
    registrationClosed: false,
    cancelled: false,
  };

  // 1. Open within window
  const openState = computeRegistrationState(baseUpcoming, NOW, true);
  assert.equal(openState.open, true);
  assert.equal(openState.reason, 'open');

  // 2. Before opening window
  const beforeWindow = computeRegistrationState(
    { ...baseUpcoming, registrationOpenAt: '2026-09-01T00:00:00Z' },
    NOW,
    true
  );
  assert.equal(beforeWindow.open, false);
  assert.equal(beforeWindow.reason, 'not_yet_open');

  // 3. After closing window
  const afterWindow = computeRegistrationState(
    { ...baseUpcoming, registrationCloseAt: '2026-08-10T00:00:00Z' },
    NOW,
    true
  );
  assert.equal(afterWindow.open, false);
  assert.equal(afterWindow.reason, 'closed_window');

  // 4. Manually closed by editor
  const manualClosed = computeRegistrationState(
    { ...baseUpcoming, registrationClosed: true },
    NOW,
    true
  );
  assert.equal(manualClosed.open, false);
  assert.equal(manualClosed.reason, 'closed');

  // 5. Event cancelled -> registration immediately disabled
  const cancelledState = computeRegistrationState(
    { ...baseUpcoming, cancelled: true },
    NOW,
    true
  );
  assert.equal(cancelledState.open, false);
  assert.equal(cancelledState.reason, 'cancelled');

  // 6. Past event -> registration never active even if publishedAt was recent
  const pastEvent = computeRegistrationState(
    {
      ...baseUpcoming,
      eventDate: '2026-05-10',
      startsAt: '2026-05-10T09:00:00Z',
      endsAt: '2026-05-10T12:00:00Z',
      publishedAt: '2026-08-15T11:00:00Z', // publication date must NEVER be treated as event date
    },
    NOW,
    true
  );
  assert.equal(pastEvent.open, false);
  assert.equal(pastEvent.reason, 'past');

  // 7. Unpublished form -> registration disabled
  const unpublishedFormState = computeRegistrationState(baseUpcoming, NOW, false);
  assert.equal(unpublishedFormState.open, false);
  assert.equal(unpublishedFormState.reason, 'form_unpublished');
});

test('Task 3 & 7: Security — publicEventView withholds private and registered_only meeting links from public API responses', async () => {
  const privateEvent = {
    id: 42,
    slug: 'diplomatic-briefing-2026',
    title: 'Closed Diplomatic Briefing',
    summary: 'High-level briefing.',
    html: '<p>Briefing details.</p>',
    details: ['Briefing details.'],
    eventDate: '2026-09-25',
    startsAt: '2026-09-25T14:00:00Z',
    endsAt: '2026-09-25T16:00:00Z',
    timezone: 'Africa/Accra',
    format: 'virtual',
    onlinePlatform: 'Zoom',
    meetingUrl: 'https://zoom.us/j/999888777?pwd=secret',
    meetingAccess: 'private',
    registrationMode: 'form',
    registrationFormKey: 'event_registration',
    status: 'published',
  };

  const fallbackForms = [
    {
      id: 'event_registration',
      title: 'Event registration',
      status: 'published',
      fields: [
        { id: 'full_name', label: 'Full name', type: 'text', required: true },
        { id: 'email', label: 'Email address', type: 'email', required: true },
      ],
    },
  ];

  const pubPrivate = await publicEventView(null, privateEvent, () => NOW, fallbackForms);
  assert.equal(pubPrivate.meetingUrl, '', 'Private meeting URL must never be exposed in public view');
  assert.equal(pubPrivate.meetingRestricted, true);
  assert.equal(pubPrivate.registrationStatus.open, true);
  assert.ok(pubPrivate.registrationForm, 'Published registration form is attached when open');

  const pubPublic = await publicEventView(
    null,
    { ...privateEvent, meetingAccess: 'public' },
    () => NOW,
    fallbackForms
  );
  assert.equal(pubPublic.meetingUrl, 'https://zoom.us/j/999888777?pwd=secret');
  assert.equal(pubPublic.meetingRestricted, false);
});

test('Task 6: Public routing, SEO JSON-LD Event schema, and CMS Preview shell work for dynamic and static events', () => {
  // Dynamic database event slug resolves properly
  assert.deepEqual(resolvePage('/events/continental-trade-forum-2026/'), {
    type: 'event',
    id: 'continental-trade-forum-2026',
  });
  assert.deepEqual(articleRequest('/events/continental-trade-forum-2026/'), {
    type: 'event',
    slug: 'continental-trade-forum-2026',
  });

  const config = {
    appEnv: 'production',
    publicSiteUrl: 'https://foreignafrica.org',
  };
  const eventItem = {
    id: 12,
    dbId: 12,
    type: 'event',
    slug: 'continental-trade-forum-2026',
    title: 'Continental Trade Forum 2026',
    summary: 'Convening policy makers and founders in Accra.',
    html: '<p>Full forum schedule and speakers.</p>',
    startsAt: '2026-11-12T09:00:00Z',
    endsAt: '2026-11-12T17:00:00Z',
    venue: 'Accra International Conference Centre',
    status: 'draft',
  };

  const meta = articleMeta(config, eventItem);
  assert.equal(meta.canonical, 'https://foreignafrica.org/events/continental-trade-forum-2026/');
  const ld = JSON.parse(meta.jsonLd);
  assert.equal(ld['@type'], 'Event');
  assert.equal(ld.name, 'Continental Trade Forum 2026');
  assert.equal(ld.location.name, 'Accra International Conference Centre');

  const shell = '<!doctype html><html><head><title>Foreign Africa</title><meta name="description" content="Default"></head><body><div id="root"></div></body></html>';
  const previewHtml = injectPreviewArticle(shell, config, eventItem);
  assert.match(previewHtml, /CMS PREVIEW/);
  assert.match(previewHtml, /href="\/admin#\/events\/12"/);
  assert.match(previewHtml, /window\.__FA_PREVIEW_DATA__/);
});

import { createApp } from '../server/app.js';
import { hashToken } from '../server/text.js';
import { seedEventsAndForms } from '../server/events-store.js';

function createInMemoryEventsPool(sessionSecret) {
  let nextEventId = 1;
  let nextRevisionId = 1;
  let nextTermId = 1;
  let nextFormId = 1;
  let nextMediaId = 1;
  let nextSubmissionId = 1;

  const state = {
    users: [
      { id: 1, email: 'admin@foreignafrica.org', name: 'Ada Admin', status: 'active', deleted_at: null },
      { id: 2, email: 'editor@foreignafrica.org', name: 'Eden Editor', status: 'active', deleted_at: null },
      { id: 3, email: 'contrib@foreignafrica.org', name: 'Cori Contributor', status: 'active', deleted_at: null },
    ],
    userRoles: new Map([
      [1, ['super_admin']],
      [2, ['editor']],
      [3, ['contributor']],
    ]),
    sessions: [
      { user_id: 1, token_hash: hashToken('admin-token', sessionSecret), expires_at: '2099-01-01 00:00:00.000', revoked_at: null },
      { user_id: 2, token_hash: hashToken('editor-token', sessionSecret), expires_at: '2099-01-01 00:00:00.000', revoked_at: null },
      { user_id: 3, token_hash: hashToken('contrib-token', sessionSecret), expires_at: '2099-01-01 00:00:00.000', revoked_at: null },
    ],
    events: [],
    eventRevisions: [],
    eventTerms: [],
    terms: [],
    forms: [],
    submissions: [],
    media: [],
    activityLogs: [],
  };

  function enrichEventRow(e) {
    const user = state.users.find(u => u.id === e.author_id);
    const feat = state.media.find(m => m.id === e.featured_media_id);
    const soc = state.media.find(m => m.id === e.social_image_id);
    return {
      ...e,
      account_name: user?.name || 'Foreign Africa',
      featured_path: feat?.storage_path || null,
      featured_alt: feat?.alt_text || '',
      social_path: soc?.storage_path || null,
    };
  }

  async function runQuery(sql, params = []) {
    const s = sql.replace(/\s+/g, ' ').trim();

    if (s.startsWith('SELECT users.id, users.email, users.name, users.status, sessions.expires_at')) {
      const hash = params[0];
      const sess = state.sessions.find(x => x.token_hash === hash);
      if (!sess) return [[]];
      const u = state.users.find(x => x.id === sess.user_id);
      return [[{ ...u, expires_at: sess.expires_at, revoked_at: sess.revoked_at }]];
    }

    if (s.startsWith('SELECT roles.role_key FROM user_roles')) {
      const uid = Number(params[0]);
      return [(state.userRoles.get(uid) || []).map(role_key => ({ role_key }))];
    }

    if (s.startsWith('INSERT INTO activity_logs')) {
      state.activityLogs.push({ sql: s, params });
      return [{ insertId: state.activityLogs.length }];
    }

    if (s.startsWith('SELECT id FROM media_assets WHERE storage_path = ?')) {
      const found = state.media.find(m => m.storage_path === params[0]);
      return [found ? [found] : []];
    }

    if (s.startsWith('INSERT INTO media_assets')) {
      const id = nextMediaId++;
      state.media.push({ id, original_name: params[0], stored_name: params[1], storage_path: params[2], alt_text: params[4], deleted_at: null });
      return [{ insertId: id }];
    }

    if (s.startsWith('SELECT id FROM media_assets WHERE id = ?')) {
      const found = state.media.find(m => m.id === Number(params[0]) && !m.deleted_at);
      return [found ? [found] : []];
    }

    // Terms
    if (s.startsWith('DELETE FROM event_terms WHERE event_id = ?')) {
      const eid = Number(params[0]);
      state.eventTerms = state.eventTerms.filter(et => et.event_id !== eid);
      return [{}];
    }
    if (s.startsWith('INSERT INTO terms')) {
      const [vocabulary, name, slug] = params;
      if (!state.terms.find(t => t.vocabulary === vocabulary && t.slug === slug)) {
        state.terms.push({ id: nextTermId++, vocabulary, name, slug });
      }
      return [{}];
    }
    if (s.startsWith('SELECT id FROM terms WHERE vocabulary = ? AND slug = ?')) {
      const found = state.terms.find(t => t.vocabulary === params[0] && t.slug === params[1]);
      return [found ? [found] : []];
    }
    if (s.startsWith('INSERT IGNORE INTO event_terms')) {
      const [event_id, term_id] = params.map(Number);
      if (!state.eventTerms.find(et => et.event_id === event_id && et.term_id === term_id)) {
        state.eventTerms.push({ event_id, term_id });
      }
      return [{}];
    }
    if (s.startsWith('SELECT et.event_id, t.vocabulary, t.name, t.slug FROM event_terms')) {
      const ids = new Set(params.map(Number));
      const rows = state.eventTerms
        .filter(et => ids.has(et.event_id))
        .map(et => {
          const t = state.terms.find(term => term.id === et.term_id);
          return t ? { event_id: et.event_id, vocabulary: t.vocabulary, name: t.name, slug: t.slug } : null;
        })
        .filter(Boolean);
      return [rows];
    }

    // Event revisions
    if (s.startsWith('SELECT COALESCE(MAX(revision_number), 0) AS max_rev FROM event_revisions')) {
      const eid = Number(params[0]);
      const revs = state.eventRevisions.filter(r => r.event_id === eid);
      const max_rev = revs.reduce((m, r) => Math.max(m, r.revision_number), 0);
      return [[{ max_rev }]];
    }
    if (s.startsWith('INSERT INTO event_revisions')) {
      const id = nextRevisionId++;
      state.eventRevisions.push({
        id,
        event_id: Number(params[0]),
        revision_number: Number(params[1]),
        title: params[2],
        summary: params[3],
        body_json: params[4],
        body_html: params[5],
        snapshot_json: params[6],
        editor_id: params[7],
        note: params[8],
        created_at: params[9],
      });
      return [{ insertId: id }];
    }
    if (s.startsWith('SELECT r.id, r.revision_number, r.editor_id')) {
      const eid = Number(params[0]);
      const rows = state.eventRevisions
        .filter(r => r.event_id === eid)
        .sort((a, b) => b.id - a.id)
        .map(r => ({
          ...r,
          editor_name: state.users.find(u => u.id === r.editor_id)?.name || 'Staff',
        }));
      return [rows];
    }
    if (s.startsWith('SELECT * FROM event_revisions WHERE id = ? AND event_id = ?')) {
      const found = state.eventRevisions.find(r => r.id === Number(params[0]) && r.event_id === Number(params[1]));
      return [found ? [found] : []];
    }

    // Events CRUD
    if (s.startsWith("SELECT id FROM events WHERE status = 'scheduled'")) {
      const nowSql = params[0];
      const due = state.events.filter(e => !e.deleted_at && e.status === 'scheduled' && e.published_at && e.published_at <= nowSql);
      return [due];
    }
    if (s.startsWith('SELECT id FROM events WHERE slug = ?')) {
      const found = state.events.find(e => e.slug === params[0]);
      return [found ? [{ id: found.id }] : []];
    }
    if (s.startsWith('SELECT slug FROM events WHERE deleted_at IS NOT NULL OR NOT')) {
      const nowSql = params[0];
      const suppressed = state.events.filter(e => {
        if (e.deleted_at) return true;
        const isPub = (e.status === 'published' && (!e.published_at || e.published_at <= nowSql)) ||
          (e.status === 'scheduled' && e.published_at && e.published_at <= nowSql);
        return !isPub;
      });
      return [suppressed.map(e => ({ slug: e.slug }))];
    }
    if (s.startsWith('INSERT INTO events')) {
      if (state.events.some(e => e.slug === params[1])) {
        const err = new Error('Duplicate slug');
        err.code = 'ER_DUP_ENTRY';
        throw err;
      }
      const id = nextEventId++;
      const row = {
        id,
        title: params[0],
        slug: params[1],
        summary: params[2],
        body_html: params[3],
        body_json: params[4],
        starts_at: params[5],
        event_date: params[6],
        ends_at: params[7],
        timezone: params[8],
        time_label: params[9],
        format: params[10],
        venue: params[11],
        organiser: params[12],
        location_address: params[13],
        online_platform: params[14],
        meeting_url: params[15],
        meeting_access: params[16],
        featured_media_id: params[17],
        image_fit: params[18],
        social_image_id: params[19],
        gallery_json: params[20],
        speakers_json: params[21],
        agenda_json: params[22],
        documents_json: params[23],
        programme_id: params[24],
        programme_label: params[25],
        story_url: params[26],
        source_label: params[27],
        source_url: params[28],
        recording_url: params[29],
        registration_mode: params[30],
        registration_url: params[31],
        registration_form_key: params[32],
        registration_open_at: params[33],
        registration_close_at: params[34],
        registration_closed: params[35],
        registration_label: params[36],
        status: params[37],
        cancelled: params[38],
        cancellation_note: params[39],
        published_at: params[40],
        featured: params[41],
        seo_title: params[42],
        seo_description: params[43],
        author_id: params[44],
        author_name: params[45],
        created_at: params[46],
        updated_at: params[47],
        deleted_at: null,
      };
      state.events.push(row);
      return [{ insertId: id }];
    }
    if (s.startsWith('UPDATE events SET deleted_at = ?, updated_at = ? WHERE id = ?')) {
      const ev = state.events.find(e => e.id === Number(params[2]));
      if (ev) { ev.deleted_at = params[0]; ev.updated_at = params[1]; }
      return [{}];
    }
    if (s.startsWith('UPDATE events SET title = ?')) {
      const id = Number(params.at(-1));
      if (state.events.some(e => e.slug === params[1] && e.id !== id)) {
        const err = new Error('Duplicate slug');
        err.code = 'ER_DUP_ENTRY';
        throw err;
      }
      const ev = state.events.find(e => e.id === id);
      if (ev) {
        Object.assign(ev, {
          title: params[0],
          slug: params[1],
          summary: params[2],
          body_html: params[3],
          body_json: params[4],
          starts_at: params[5],
          event_date: params[6],
          ends_at: params[7],
          timezone: params[8],
          time_label: params[9],
          format: params[10],
          venue: params[11],
          organiser: params[12],
          location_address: params[13],
          online_platform: params[14],
          meeting_url: params[15],
          meeting_access: params[16],
          featured_media_id: params[17],
          image_fit: params[18],
          social_image_id: params[19],
          gallery_json: params[20],
          speakers_json: params[21],
          agenda_json: params[22],
          documents_json: params[23],
          programme_id: params[24],
          programme_label: params[25],
          story_url: params[26],
          source_label: params[27],
          source_url: params[28],
          recording_url: params[29],
          registration_mode: params[30],
          registration_url: params[31],
          registration_form_key: params[32],
          registration_open_at: params[33],
          registration_close_at: params[34],
          registration_closed: params[35],
          registration_label: params[36],
          status: params[37],
          cancelled: params[38],
          cancellation_note: params[39],
          published_at: params[40],
          featured: params[41],
          seo_title: params[42],
          seo_description: params[43],
          author_name: params[44],
          updated_at: params[45],
        });
      }
      return [{}];
    }
    if (s.startsWith('SELECT e.*, u.name AS account_name')) {
      let rows = state.events.filter(e => !e.deleted_at);
      if (s.includes('WHERE e.id = ?')) {
        rows = rows.filter(e => e.id === Number(params[0]));
      } else if (s.includes('WHERE e.slug = ?')) {
        const slug = params[0];
        rows = rows.filter(e => e.slug === slug);
        if (s.includes("e.status = 'published'")) {
          const nowSql = params[1];
          rows = rows.filter(e =>
            (e.status === 'published' && (!e.published_at || e.published_at <= nowSql)) ||
            (e.status === 'scheduled' && e.published_at && e.published_at <= nowSql)
          );
        }
      } else {
        if (s.includes("((e.status = 'published'")) {
          const nowSql = params[0];
          rows = rows.filter(e =>
            (e.status === 'published' && (!e.published_at || e.published_at <= nowSql)) ||
            (e.status === 'scheduled' && e.published_at && e.published_at <= nowSql)
          );
        } else if (s.includes('e.cancelled = 1')) {
          rows = rows.filter(e => Boolean(e.cancelled));
        } else if (s.includes('e.status = ?')) {
          rows = rows.filter(e => e.status === params[0]);
        }
      }
      return [rows.map(enrichEventRow)];
    }
    if (s.startsWith('SELECT COUNT(*) AS n FROM events e')) {
      let rows = state.events.filter(e => !e.deleted_at);
      if (s.includes('e.cancelled = 1') && !s.includes('status')) {
        return [[{ n: rows.filter(e => Boolean(e.cancelled)).length }]];
      }
      if (s.includes("((e.status = 'published'")) {
        const nowSql = params[0];
        rows = rows.filter(e =>
          (e.status === 'published' && (!e.published_at || e.published_at <= nowSql)) ||
          (e.status === 'scheduled' && e.published_at && e.published_at <= nowSql)
        );
      }
      return [[{ n: rows.length }]];
    }
    if (s.startsWith('SELECT e.status, COUNT(*) AS n FROM events e')) {
      const counts = new Map();
      for (const e of state.events.filter(x => !x.deleted_at)) {
        counts.set(e.status, (counts.get(e.status) || 0) + 1);
      }
      return [[...counts.entries()].map(([status, n]) => ({ status, n }))];
    }

    // Forms
    if (s.includes('forms') && /\b(deleted_at|description|recipient_email|author_id)\b/i.test(s)) {
      const err = new Error(`ER_BAD_FIELD_ERROR in forms query: ${s}`);
      err.code = 'ER_BAD_FIELD_ERROR';
      throw err;
    }
    if (s.startsWith('SELECT * FROM forms')) {
      let rows = [...state.forms];
      if (s.includes('form_key = ?')) {
        rows = rows.filter(f => f.form_key === params[0]);
      }
      if (s.includes("status = 'published'")) {
        rows = rows.filter(f => f.status === 'published');
      }
      return [rows];
    }
    if (s.startsWith('INSERT INTO forms (form_key, purpose')) {
      const id = nextFormId++;
      state.forms.push({
        id,
        form_key: params[0],
        purpose: params[1],
        title: params[2],
        success_message: params[3],
        consent_label: params[4],
        fields_json: params[5],
        status: params[6],
        created_at: params[7],
        updated_at: params[8],
      });
      return [{ insertId: id }];
    }
    if (s.startsWith('UPDATE forms SET purpose = ?')) {
      const formKey = params.at(-1);
      const f = state.forms.find(x => x.form_key === formKey);
      if (f) {
        Object.assign(f, {
          purpose: params[0],
          title: params[1],
          success_message: params[2],
          consent_label: params[3],
          fields_json: params[4],
          status: params[5],
          updated_at: params[6],
        });
      }
      return [{}];
    }
    if (s.startsWith('INSERT INTO forms (form_key, title, success_message')) {
      let f = state.forms.find(x => x.form_key === params[0]);
      if (!f) {
        f = { id: nextFormId++, form_key: params[0], title: params[1], success_message: params[2], status: 'published', deleted_at: null };
        state.forms.push(f);
      }
      return [{ insertId: f.id }];
    }
    if (s.startsWith('SELECT id FROM forms WHERE form_key = ?')) {
      const f = state.forms.find(x => x.form_key === params[0]);
      return [f ? [{ id: f.id }] : []];
    }

    // Submissions
    if (s.startsWith('SELECT reference FROM submissions WHERE client_key = ?')) {
      const found = state.submissions.find(sub => sub.client_key === params[0]);
      return [found ? [{ reference: found.reference }] : []];
    }
    if (s.startsWith('INSERT INTO submissions')) {
      const id = nextSubmissionId++;
      state.submissions.push({
        id,
        reference: params[0],
        form_id: params[1],
        payload: params[2],
        client_key: params[3],
        ip_hash: params[4],
        status: 'new',
        assigned_to: null,
        handled_at: null,
        created_at: params[5],
      });
      return [{ insertId: id }];
    }
    if (s.startsWith('SELECT s.id, s.reference, s.payload')) {
      const rows = state.submissions.map(sub => {
        const f = state.forms.find(x => x.id === sub.form_id);
        return {
          ...sub,
          form_key: f?.form_key || 'event_registration',
          form_title: f?.title || 'Event registration',
          assignee_name: null,
        };
      });
      return [rows];
    }
    if (s.startsWith('SELECT COUNT(*) AS n FROM submissions s')) {
      return [[{ n: state.submissions.length }]];
    }

    return [[]];
  }

  return {
    state,
    query: runQuery,
    execute: runQuery,
  };
}

test('Task 8: End-to-End 12-Step Events CMS Workflow (Seeding, CRUD, Drafts, Private Preview, Publish, Edit, Forms, Submissions, Close, Cancel & Archive)', async t => {
  const sessionSecret = 'test-events-session-secret-32chars!!';
  const origin = 'http://127.0.0.1:9';
  const pool = createInMemoryEventsPool(sessionSecret);
  const clock = () => NOW;
  const shell = () => '<!doctype html><html><head><title>Foreign Africa</title><meta name="description" content="Default"></head><body><div id="root"></div></body></html>';
  const config = {
    appEnv: 'test',
    publicSiteUrl: origin,
    sessionSecret,
    cookieSecure: false,
    passwordCost: 4,
    mediaRoot: '',
    stagingUser: '',
    stagingPassword: '',
    legacyFileEditing: false,
  };

  // Seed existing 3 public events and forms idempotently
  const seedReport1 = await seedEventsAndForms({ pool, clock });
  assert.equal(seedReport1.eventsInserted.length, 3);
  assert.deepEqual(
    seedReport1.eventsInserted.sort(),
    ['cohort-completion-2026', 'edws-beyond-the-logo', 'edws-funding-your-startup']
  );
  assert.ok(seedReport1.formsInserted.includes('event_registration'));

  // Re-running seed does not overwrite or duplicate existing events
  const seedReport2 = await seedEventsAndForms({ pool, clock });
  assert.equal(seedReport2.eventsInserted.length, 0);
  assert.equal(seedReport2.eventsExisting.length, 3);

  const app = createApp({ config, pool, clock, shell });

  async function apiCall(path, { method = 'GET', body, token } = {}) {
    return new Promise((resolve, reject) => {
      const headers = {
        'content-type': 'application/json',
        origin: origin,
        host: '127.0.0.1:9',
        ...(token ? { cookie: `fa_staff=${token}` } : {}),
      };
      const req = {
        method,
        url: path,
        originalUrl: path,
        path: path.split('?')[0],
        headers,
        body: body ?? {},
        _body: true,
        ip: '127.0.0.1',
        connection: { remoteAddress: '127.0.0.1' },
        socket: { remoteAddress: '127.0.0.1' },
        get(name) { return headers[String(name).toLowerCase()]; },
      };
      const resHeaders = {};
      const res = {
        statusCode: 200,
        headersSent: false,
        setHeader(k, v) { resHeaders[String(k).toLowerCase()] = v; },
        getHeader(k) { return resHeaders[String(k).toLowerCase()]; },
        removeHeader(k) { delete resHeaders[String(k).toLowerCase()]; },
        status(code) { this.statusCode = code; return this; },
        type() { return this; },
        json(payload) {
          this.headersSent = true;
          resolve({ status: this.statusCode, data: payload, text: JSON.stringify(payload) });
          return this;
        },
        send(payload) {
          this.headersSent = true;
          const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
          let data = {};
          try { data = typeof payload === 'object' ? payload : JSON.parse(text); } catch { /* HTML */ }
          resolve({ status: this.statusCode, data, text });
          return this;
        },
        end(payload = '') {
          this.headersSent = true;
          resolve({ status: this.statusCode, data: {}, text: String(payload) });
          return this;
        },
      };
      try {
        app(req, res, err => {
          if (err) reject(err);
          else resolve({ status: res.statusCode || 404, data: {}, text: '' });
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  // Step 1 & 2: Create a new event and save as draft
  const createRes = await apiCall('/api/staff/events', {
    method: 'POST',
    token: 'editor-token',
    body: {
      title: 'West Africa Digital Trade & Policy Convening 2026',
      slug: 'west-africa-digital-trade-2026',
      summary: 'High-level dialogue on AFCFTA digital trade protocols and youth enterprise.',
      document: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Convening Overview' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Bringing together policy leaders and entrepreneurs in Accra.' }] },
        ],
      },
      eventDate: '2026-10-15',
      startsAt: '2026-10-15T09:00:00Z',
      endsAt: '2026-10-15T16:00:00Z',
      timezone: 'Africa/Accra',
      timeLabel: '9:00 AM – 4:00 PM GMT',
      format: 'hybrid',
      venue: 'Kempinski Hotel Gold Coast City, Accra',
      locationAddress: 'Ministries, Gamel Abdul Nasser Ave, Accra',
      onlinePlatform: 'Zoom',
      meetingUrl: 'https://zoom.us/j/123456789?pwd=staffonly',
      meetingAccess: 'private',
      speakers: [
        { name: 'Dr. Ama Mensah', role: 'Keynote Speaker', organisation: 'AfCFTA Secretariat', bio: 'Trade policy specialist.' },
      ],
      agenda: [
        { time: '09:00 GMT', title: 'Opening Plenary', speaker: 'Dr. Ama Mensah', description: 'Keynote address' },
      ],
      documents: [
        { title: 'Concept Note', url: '/images/join-community.jpg', type: 'PDF' },
      ],
      programmeId: 'policy-dialogues',
      programmeLabel: 'Policy Dialogues & Convenings',
      registrationMode: 'form',
      registrationFormKey: 'event_registration',
      registrationLabel: 'Register to attend',
      status: 'draft',
    },
  });
  assert.equal(createRes.status, 201);
  const eventId = createRes.data.item.id;
  assert.equal(createRes.data.item.status, 'draft');
  assert.equal(createRes.data.item.slug, 'west-africa-digital-trade-2026');

  // Step 3: Refresh / fetch from DB and verify persistence
  const fetchedDraft = await apiCall(`/api/staff/events/${eventId}`, { token: 'editor-token' });
  assert.equal(fetchedDraft.status, 200);
  assert.equal(fetchedDraft.data.item.title, 'West Africa Digital Trade & Policy Convening 2026');
  assert.equal(fetchedDraft.data.item.speakers.length, 1);
  assert.equal(fetchedDraft.data.item.agenda.length, 1);
  assert.equal(fetchedDraft.data.item.format, 'hybrid');

  // Draft must NOT be exposed on public endpoints
  const publicBeforePublish = await apiCall('/api/public/events/west-africa-digital-trade-2026');
  assert.equal(publicBeforePublish.status, 404);

  // Step 4: Preview privately
  const unauthPreview = await apiCall(`/api/staff/events/${eventId}/preview`);
  assert.equal(unauthPreview.status, 401, 'Unauthenticated preview must be rejected');

  const staffPreview = await apiCall(`/api/staff/events/${eventId}/preview`, { token: 'editor-token' });
  assert.equal(staffPreview.status, 200);
  assert.match(staffPreview.text, /CMS PREVIEW/);
  assert.match(staffPreview.text, /West Africa Digital Trade &amp; Policy Convening 2026/);
  assert.match(staffPreview.text, /window\.__FA_PREVIEW_DATA__/);

  // Step 5: Publish event (Contributors cannot publish; Editors can)
  const contribPublish = await apiCall(`/api/staff/events/${eventId}/state`, {
    method: 'POST',
    token: 'contrib-token',
    body: { status: 'published' },
  });
  assert.equal(contribPublish.status, 403, 'Contributors must not be able to publish events');

  const publishRes = await apiCall(`/api/staff/events/${eventId}/state`, {
    method: 'POST',
    token: 'editor-token',
    body: { status: 'published' },
  });
  assert.equal(publishRes.status, 200);
  assert.equal(publishRes.data.item.status, 'published');

  // Step 6: Verify public event listing and detail page
  const publicList = await apiCall('/api/public/events');
  assert.equal(publicList.status, 200);
  assert.ok(publicList.data.items.some(e => e.slug === 'west-africa-digital-trade-2026'));
  assert.ok(publicList.data.items.some(e => e.slug === 'cohort-completion-2026'));

  const publicDetail = await apiCall('/api/public/events/west-africa-digital-trade-2026');
  assert.equal(publicDetail.status, 200);
  assert.equal(publicDetail.data.item.title, 'West Africa Digital Trade & Policy Convening 2026');
  assert.equal(publicDetail.data.item.meetingUrl, '', 'Private Zoom link must be withheld from public API');
  assert.equal(publicDetail.data.item.meetingRestricted, true);
  assert.equal(publicDetail.data.item.registrationStatus.open, true);
  assert.ok(publicDetail.data.item.registrationForm, 'Published registration form is embedded on public event response');

  // Step 7: Edit the event and confirm changes appear immediately on the public page without rebuild
  const editRes = await apiCall(`/api/staff/events/${eventId}`, {
    method: 'PATCH',
    token: 'editor-token',
    body: {
      summary: 'Updated summary: Continental digital trade protocol roundtable in Accra.',
      venue: 'Accra International Conference Centre (Main Hall)',
    },
  });
  assert.equal(editRes.status, 200);

  const publicAfterEdit = await apiCall('/api/public/events/west-africa-digital-trade-2026');
  assert.equal(publicAfterEdit.data.item.summary, 'Updated summary: Continental digital trade protocol roundtable in Accra.');
  assert.equal(publicAfterEdit.data.item.venue, 'Accra International Conference Centre (Main Hall)');

  // Check revisions were recorded
  const revsRes = await apiCall(`/api/staff/events/${eventId}/revisions`, { token: 'editor-token' });
  assert.equal(revsRes.status, 200);
  assert.ok(revsRes.data.revisions.length >= 2);

  // Step 8 & 9: Test registration submission and restricted staff review
  const regSubmit = await apiCall('/api/public/events/west-africa-digital-trade-2026/register', {
    method: 'POST',
    body: {
      formId: 'event_registration',
      key: 'attendee-1-key',
      answers: {
        name: 'Kofi Mensah',
        email: 'kofi@example.org',
        organisation: 'Accra Tech Hub',
      },
    },
  });
  assert.equal(regSubmit.status, 200);
  assert.equal(regSubmit.data.ok, true);
  assert.match(regSubmit.data.reference, /^FA-/);

  // Contributor without submissions.read cannot read submissions; Editor/Admin can
  const contribSubs = await apiCall('/api/staff/submissions', { token: 'contrib-token' });
  assert.equal(contribSubs.status, 403);

  const adminSubs = await apiCall('/api/staff/submissions', { token: 'admin-token' });
  assert.equal(adminSubs.status, 200);
  assert.equal(adminSubs.data.items.length, 1);
  assert.equal(adminSubs.data.items[0].answers.name, 'Kofi Mensah');

  // Step 10: Close registration and verify public submission is blocked
  await apiCall(`/api/staff/events/${eventId}`, {
    method: 'PATCH',
    token: 'editor-token',
    body: { registrationClosed: true },
  });

  const detailClosed = await apiCall('/api/public/events/west-africa-digital-trade-2026');
  assert.equal(detailClosed.data.item.registrationStatus.open, false);
  assert.equal(detailClosed.data.item.registrationStatus.reason, 'closed');
  assert.equal(detailClosed.data.item.registrationForm, null);

  const blockedSubmit = await apiCall('/api/public/events/west-africa-digital-trade-2026/register', {
    method: 'POST',
    body: {
      formId: 'event_registration',
      key: 'attendee-2-key',
      answers: { full_name: 'Late Registrant', email: 'late@example.org' },
    },
  });
  assert.equal(blockedSubmit.status, 400);
  assert.match(blockedSubmit.data.error, /closed/i);

  // Step 11 & 12: Cancel event, then archive event, and verify public listings & states update properly
  await apiCall(`/api/staff/events/${eventId}/state`, {
    method: 'POST',
    token: 'editor-token',
    body: { cancelled: true, cancellationNote: 'Rescheduled to Q1 2027.' },
  });

  const detailCancelled = await apiCall('/api/public/events/west-africa-digital-trade-2026');
  assert.equal(detailCancelled.data.item.cancelled, true);
  assert.equal(detailCancelled.data.item.scheduleState, 'cancelled');
  assert.equal(detailCancelled.data.item.registrationStatus.open, false);

  // Archive the event -> disappears from public listing and is added to suppressedSlugs
  await apiCall(`/api/staff/events/${eventId}/state`, {
    method: 'POST',
    token: 'editor-token',
    body: { status: 'archived' },
  });

  const detailArchived = await apiCall('/api/public/events/west-africa-digital-trade-2026');
  assert.equal(detailArchived.status, 404);

  const listAfterArchive = await apiCall('/api/public/events');
  assert.ok(!listAfterArchive.data.items.some(e => e.slug === 'west-africa-digital-trade-2026'));
  assert.ok(listAfterArchive.data.suppressedSlugs.includes('west-africa-digital-trade-2026'));
});
