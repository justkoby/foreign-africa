import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import {
  ArrowLeft,
  Ban,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  FileText,
  Globe,
  History,
  Image as ImageIcon,
  Link2,
  MapPin,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Users,
  Video,
  X,
} from 'lucide-react';
import { allows } from '../../../server/permissions.js';
import { api } from '../api.js';
import { MediaPicker } from '../MediaLibrary.jsx';
import { setUnsaved } from '../unsaved.js';
import { Button, Chip, StatusChip, Switch, Tabs, Notice, Skeleton, useFeedback } from '../ui/index.jsx';
import { documentFacts, editorExtensions, insertBlock } from './extensions.js';
import Toolbar from './Toolbar.jsx';
import GeminiAssistant from './GeminiAssistant.jsx';
import './editor.css';

const TIMEZONES = [
  ['Africa/Accra', 'Africa/Accra (GMT / UTC+0)'],
  ['UTC', 'UTC (Coordinated Universal Time)'],
  ['Africa/Addis_Ababa', 'Africa/Addis Ababa (EAT / UTC+3)'],
  ['Africa/Kigali', 'Africa/Kigali (CAT / UTC+2)'],
  ['Africa/Johannesburg', 'Africa/Johannesburg (SAST / UTC+2)'],
  ['Africa/Lagos', 'Africa/Lagos (WAT / UTC+1)'],
  ['Africa/Nairobi', 'Africa/Nairobi (EAT / UTC+3)'],
  ['Africa/Cairo', 'Africa/Cairo (EET / UTC+2)'],
  ['Europe/London', 'Europe/London (GMT / BST)'],
  ['America/New_York', 'America/New York (EST / EDT)'],
];

const PROGRAMME_OPTIONS = [
  ['', 'None / General Event'],
  ['african-diplomatic-academy', 'African Diplomatic Academy (ADA)'],
  ['emerging-entrepreneurs-programme', 'Emerging Entrepreneurs Programme (EEP)'],
  ['policy-dialogues', 'Policy Dialogues & Convenings'],
  ['research-and-publications', 'Research & Publications'],
  ['institutional-engagement', 'Institutional Engagement'],
];

const blankEvent = user => ({
  type: 'event',
  title: '',
  slug: '',
  summary: '',
  document: { type: 'doc', content: [] },
  startsAt: null,
  endsAt: null,
  eventDate: '',
  timezone: 'Africa/Accra',
  timeLabel: '',
  format: 'physical',
  venue: '',
  organiser: 'Foreign Africa',
  locationAddress: '',
  onlinePlatform: '',
  meetingUrl: '',
  meetingAccess: 'private',
  featuredMediaId: null,
  image: '',
  imageAlt: '',
  imageFit: 'cover',
  socialImageId: null,
  socialImage: '',
  gallery: [],
  speakers: [],
  agenda: [],
  documents: [],
  programmeId: '',
  programmeLabel: '',
  storyUrl: '',
  sourceLabel: '',
  sourceUrl: '',
  recordingUrl: '',
  registrationMode: 'none',
  registrationUrl: '',
  registrationFormKey: 'event_registration',
  registrationOpenAt: null,
  registrationCloseAt: null,
  registrationClosed: false,
  registrationLabel: 'Register for event',
  status: 'draft',
  cancelled: false,
  cancellationNote: '',
  publishedAt: null,
  featured: false,
  seoTitle: '',
  seoDescription: '',
  authorName: user?.name || 'Foreign Africa',
  category: 'Event',
  tags: [],
});

const dateInput = value => (value ? String(value).slice(0, 10) : '');
const dtInput = value => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const localInput = date => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const timeStr = value => (value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '');

function Panel({ title, children, open = true, hint }) {
  return <details className="ed-panel" open={open}><summary>{title}{hint && <small>{hint}</small>}</summary><div>{children}</div></details>;
}

const panelPref = () => {
  try { return window.localStorage.getItem('fa-editor-panel') !== 'closed'; } catch { return true; }
};

export default function EventEditor({ id, user }) {
  const [item, setItem] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    if (id === 'new') {
      setItem(blankEvent(user));
      return undefined;
    }
    api(`/api/staff/events/${id}`)
      .then(data => live && setItem(data.item))
      .catch(reason => live && setError(reason.message));
    return () => { live = false; };
  }, [id, user]);

  if (error) return <div className="fa-page"><Notice tone="danger" title="This event could not be opened">{error}</Notice></div>;
  if (!item) return <div className="ed-loading" aria-busy="true"><Skeleton width="60%" height={38} /><Skeleton height={320} /></div>;
  return <EditingEvent key={item.id ?? 'new'} initial={item} user={user} />;
}

function EditingEvent({ initial, user }) {
  const [item, setItem] = useState(initial);
  const [edits, setEdits] = useState(0);
  const [state, setState] = useState('');
  const [error, setError] = useState('');
  const [picker, setPicker] = useState('');
  const [speakerPhotoIdx, setSpeakerPhotoIdx] = useState(null);
  const [revisions, setRevisions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [formsList, setFormsList] = useState([]);
  const [tagDraft, setTagDraft] = useState('');
  const [editingSlug, setEditingSlug] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleAt, setScheduleAt] = useState(() => localInput(new Date(Date.now() + 3600000)));
  const [panelTab, setPanelTab] = useState('document');
  const [panelOpen, setPanelOpen] = useState(panelPref);
  const [geminiWide, setGeminiWide] = useState(false);
  const [selectedText, setSelectedText] = useState('');

  const { toast, confirm } = useFeedback();
  const titleRef = useRef(null);
  const latest = useRef(item);
  latest.current = item;
  const saving = useRef(false);
  const dirty = edits > 0;
  const canPublish = allows(user.roles, 'content.publish');
  const canDelete = allows(user.roles, 'content.delete');

  const change = useCallback(patch => {
    setItem(current => ({ ...current, ...(typeof patch === 'function' ? patch(current) : patch) }));
    setEdits(n => n + 1);
    setState('unsaved');
  }, []);

  const extensions = useMemo(() => editorExtensions('Write the event overview, programme background, participation details, and key takeaways…'), []);
  const editor = useEditor({
    extensions,
    content: initial.document?.type === 'doc' ? initial.document : { type: 'doc', content: [] },
    onUpdate: ({ editor: instance }) => change({ document: instance.getJSON() }),
    onSelectionUpdate: ({ editor: instance }) => {
      const { from, to } = instance.state.selection;
      if (to > from) {
        setSelectedText(instance.state.doc.textBetween(from, to, '\n\n').trim());
      } else {
        setSelectedText('');
      }
    },
  });

  useEffect(() => { setUnsaved(dirty); return () => setUnsaved(false); }, [dirty]);
  useEffect(() => {
    const el = titleRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; }
  }, [item.title]);

  useEffect(() => {
    api('/api/staff/terms?vocabulary=category')
      .then(data => setCategories((data.terms ?? []).map(term => term.name)))
      .catch(() => {});
    api('/api/staff/forms')
      .then(data => setFormsList(data.forms ?? []))
      .catch(() => {});
  }, []);

  const loadRevisions = useCallback(eventId => {
    if (eventId) {
      api(`/api/staff/events/${eventId}/revisions`)
        .then(data => setRevisions(data.revisions ?? []))
        .catch(() => {});
    }
  }, []);

  useEffect(() => { loadRevisions(initial.id); }, [initial.id, loadRevisions]);

  function togglePanel() {
    setPanelOpen(open => {
      const next = !open;
      try { window.localStorage.setItem('fa-editor-panel', next ? 'open' : 'closed'); } catch { /* ignore */ }
      return next;
    });
  }

  const persist = useCallback(async (override = {}, { quiet = false } = {}) => {
    if (saving.current) return null;
    const snapshot = { ...latest.current, ...override };
    if (!snapshot.title.trim()) {
      if (!quiet) setError('Add an event title before saving.');
      return null;
    }
    saving.current = true;
    setState('saving');
    setError('');
    try {
      const data = snapshot.id
        ? await api(`/api/staff/events/${snapshot.id}`, { method: 'PATCH', body: snapshot })
        : await api('/api/staff/events', { method: 'POST', body: snapshot });
      setItem(data.item);
      setEdits(0);
      setState('saved');
      if (!snapshot.id && data.item.id) {
        window.history.replaceState(null, '', `#/events/${data.item.id}`);
      }
      loadRevisions(data.item.id);
      if (!quiet) toast('Event saved.');
      return data.item;
    } catch (reason) {
      setState('error');
      setError(reason.message);
      if (!quiet) toast(reason.message, 'error');
      return null;
    } finally {
      saving.current = false;
    }
  }, [loadRevisions, toast]);

  useEffect(() => {
    if (!dirty || !item.title.trim()) return undefined;
    const timer = setTimeout(() => { persist({}, { quiet: true }); }, 4000);
    return () => clearTimeout(timer);
  }, [dirty, edits, item.title, persist]);

  useEffect(() => {
    const onKey = event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        persist();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [persist]);

  async function changeState(status, publishedAt) {
    const saved = dirty || !item.id ? await persist({}, { quiet: true }) : item;
    if (!saved) return;
    try {
      const data = await api(`/api/staff/events/${saved.id}/state`, {
        method: 'POST',
        body: { status, publishedAt },
      });
      setItem(data.item);
      setEdits(0);
      setState('saved');
      setScheduling(false);
      loadRevisions(data.item.id);
      toast(
        status === 'published'
          ? 'Event published on the website.'
          : status === 'scheduled'
            ? 'Event scheduled for publication.'
            : status === 'archived'
              ? 'Event archived.'
              : 'Moved to draft.'
      );
    } catch (reason) {
      setError(reason.message);
      toast(reason.message, 'error');
    }
  }

  async function publishNow() {
    if (!await confirm({
      title: 'Publish this event?',
      message: 'It will appear on the public Foreign Africa Events page immediately.',
      confirm: 'Publish event',
    })) return;
    await changeState('published', item.publishedAt);
  }

  async function scheduleConfirm() {
    const when = new Date(scheduleAt);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      toast('Choose a future date and time.', 'error');
      return;
    }
    await changeState('scheduled', when.toISOString());
  }

  async function duplicate() {
    if (!item.id) return;
    try {
      const data = await api(`/api/staff/events/${item.id}/duplicate`, { method: 'POST', body: {} });
      toast('Duplicated as a draft.');
      window.location.hash = `#/events/${data.item.id}`;
    } catch (reason) {
      toast(reason.message, 'error');
    }
  }

  async function remove() {
    if (!item.id || !await confirm({
      title: 'Delete this event?',
      message: 'It will be removed from the Studio and the public website.',
      confirm: 'Delete event',
      danger: true,
    })) return;
    await api(`/api/staff/events/${item.id}`, { method: 'DELETE' });
    setUnsaved(false);
    toast('Event deleted.');
    window.location.hash = '#/events';
  }

  async function restore(revisionId) {
    if (!await confirm({
      title: 'Restore this revision?',
      message: 'The restored version will be saved as a draft so you can review it before publishing.',
      confirm: 'Restore revision',
    })) return;
    const data = await api(`/api/staff/events/${item.id}/restore`, { method: 'POST', body: { revisionId } });
    setItem(data.item);
    editor?.commands.setContent(data.item.document);
    setEdits(0);
    setState('saved');
    loadRevisions(data.item.id);
    toast('Revision restored as a draft.');
  }

  async function openPreview() {
    const saved = dirty || !item.id ? await persist({}, { quiet: true }) : item;
    if (!saved?.id) {
      toast('Add an event title before previewing.', 'error');
      return;
    }
    window.open(`/api/staff/events/${saved.id}/preview`, '_blank', 'noopener,noreferrer');
  }

  function addTag() {
    const clean = tagDraft.trim().replace(/,+$/, '');
    if (!clean || (item.tags ?? []).includes(clean)) { setTagDraft(''); return; }
    change({ tags: [...(item.tags ?? []), clean] });
    setTagDraft('');
  }

  function pickMedia(asset) {
    if (picker === 'body') {
      insertBlock(editor, asset.kind === 'pdf'
        ? { type: 'paragraph', content: [{ type: 'text', text: asset.title || asset.originalName, marks: [{ type: 'link', attrs: { href: asset.url } }] }] }
        : { type: 'image', attrs: { src: asset.url, alt: asset.altText || asset.title || '', caption: asset.caption || '', credit: asset.creditLine || '' } });
    } else if (picker === 'featured') {
      change({ featuredMediaId: asset.id, image: asset.url, imageAlt: asset.altText || '' });
    } else if (picker === 'social') {
      change({ socialImageId: asset.id, socialImage: asset.url });
    } else if (picker === 'gallery') {
      change({
        gallery: [
          ...(item.gallery ?? []),
          { mediaId: asset.id, url: asset.url, alt: asset.altText || asset.title || '', caption: asset.caption || '' },
        ],
      });
    } else if (picker === 'document') {
      change({
        documents: [
          ...(item.documents ?? []),
          { mediaId: asset.id, title: asset.title || asset.originalName || 'Event document', url: asset.url, type: asset.kind === 'pdf' ? 'PDF' : 'File' },
        ],
      });
    } else if (picker === 'speaker' && speakerPhotoIdx !== null) {
      const next = [...(item.speakers ?? [])];
      if (next[speakerPhotoIdx]) {
        next[speakerPhotoIdx] = { ...next[speakerPhotoIdx], photoUrl: asset.url };
        change({ speakers: next });
      }
      setSpeakerPhotoIdx(null);
    }
    setPicker('');
  }

  const facts = useMemo(() => documentFacts(item.document), [item.document]);
  const saveText = state === 'saving'
    ? 'Saving…'
    : state === 'saved'
      ? 'All changes saved'
      : state === 'error'
        ? 'Not saved'
        : dirty
          ? 'Unsaved changes'
          : item.updatedAt
            ? `Last saved ${timeStr(item.updatedAt)}`
            : 'New draft';

  const publishedForms = formsList.filter(f => f.status === 'published');

  return <div className="ed-shell">
    <header className="ed-topbar">
      <div className="ed-topbar-left">
        <a className="fa-btn fa-btn--ghost fa-btn--sm" href="#/events"><ArrowLeft aria-hidden="true" />Events</a>
        <div className="ed-topbar-title">
          <strong>{item.title || 'Untitled event'}</strong>
          <span className={`ed-save is-${state || 'idle'}`} role="status">{saveText}</span>
        </div>
      </div>
      <div className="ed-topbar-actions">
        {item.cancelled && <Chip tone="danger">Cancelled</Chip>}
        <StatusChip status={item.status} />
        <Button variant="secondary" size="sm" icon={Eye} onClick={openPreview}>Preview</Button>
        {item.id && item.status === 'published' && (
          <a className="fa-btn fa-btn--ghost fa-btn--sm" href={`/events/${item.slug}/`} target="_blank" rel="noreferrer">
            <ExternalLink aria-hidden="true" />View live
          </a>
        )}
        <Button
          variant={panelOpen && panelTab === 'gemini' ? 'primary' : 'secondary'}
          size="sm"
          icon={Sparkles}
          onClick={() => {
            if (panelOpen && panelTab === 'gemini') {
              setPanelOpen(false);
            } else {
              setPanelTab('gemini');
              setPanelOpen(true);
            }
          }}
        >
          Gemini
        </Button>
        <Button variant="secondary" size="sm" onClick={() => persist()}>
          {item.status === 'published' && !dirty ? 'Saved' : item.status === 'published' ? 'Update' : 'Save draft'}
        </Button>
        {canPublish && item.status !== 'published' && (
          <Button variant="primary" size="sm" onClick={publishNow}>Publish</Button>
        )}
        {canPublish && item.status !== 'published' && (
          <Button variant="ghost" size="sm" icon={CalendarClock} onClick={() => setScheduling(s => !s)}>Schedule</Button>
        )}
        <button
          type="button"
          className="fa-iconbtn"
          aria-label={panelOpen ? 'Hide settings panel' : 'Show settings panel'}
          title={panelOpen ? 'Hide settings panel' : 'Show settings panel'}
          onClick={togglePanel}
        >
          {panelOpen ? <PanelRightClose aria-hidden="true" /> : <PanelRightOpen aria-hidden="true" />}
        </button>
      </div>
    </header>

    {scheduling && (
      <div className="ed-schedule-bar" role="region" aria-label="Schedule publication">
        <CalendarClock aria-hidden="true" />
        <span>Publish event listing automatically on</span>
        <input type="datetime-local" className="fa-input" value={scheduleAt} onChange={event => setScheduleAt(event.target.value)} />
        <Button variant="primary" size="sm" onClick={scheduleConfirm}>Confirm schedule</Button>
        <Button variant="ghost" size="sm" onClick={() => setScheduling(false)}>Cancel</Button>
      </div>
    )}

    {error && <div className="ed-banner"><Notice tone="danger" title="Could not save event">{error}</Notice></div>}

    <div className={`ed-workspace${panelOpen ? '' : ' is-panel-closed'}${panelOpen && panelTab === 'gemini' ? (geminiWide ? ' is-gemini-expanded' : ' is-gemini-open') : ''}`}>
      <div className="ed-canvas-wrap">
        <div className="ed-canvas">
          <textarea
            ref={titleRef}
            className="ed-title"
            rows={1}
             value={item.title}
            onChange={event => change({ title: event.target.value })}
            placeholder="Event title"
            aria-label="Event title"
          />

          <div className="ed-permalink">
            <span>Permalink:</span>
            {editingSlug ? (
              <>
                <input
                  className="fa-input"
                  value={item.slug}
                  onChange={event => change({ slug: event.target.value })}
                  placeholder="url-slug"
                  aria-label="URL slug"
                />
                <Button size="sm" variant="ghost" onClick={() => setEditingSlug(false)}>Done</Button>
              </>
            ) : (
              <>
                <code>/events/{item.slug || 'event-slug'}/</code>
                <button type="button" onClick={() => setEditingSlug(true)}>Edit</button>
              </>
            )}
          </div>

          {/* Structured Event Schedule, Format & Location Card */}
          <div style={{
            background: 'var(--fa-surface-subtle, #f8fafc)',
            border: '1px solid var(--fa-border, #e2e8f0)',
            borderRadius: 12,
            padding: 18,
            marginBottom: 20,
            display: 'grid',
            gap: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <Calendar size={16} /> Event Schedule, Format &amp; Location
              </strong>
              <small style={{ color: 'var(--fa-text-muted)' }}>
                Leave dates or times empty when historical source material is incomplete.
              </small>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
              <label className="fa-field">
                <span className="fa-label">Event Date</span>
                <input
                  className="fa-input"
                  type="date"
                  value={dateInput(item.eventDate || item.startsAt)}
                  onChange={e => change({ eventDate: e.target.value })}
                />
                <span className="fa-hint">Primary calendar date (optional if TBA)</span>
              </label>

              <label className="fa-field">
                <span className="fa-label">Start Date &amp; Time</span>
                <input
                  className="fa-input"
                  type="datetime-local"
                  value={dtInput(item.startsAt)}
                  onChange={e => {
                    const iso = e.target.value ? new Date(e.target.value).toISOString() : null;
                    change({
                      startsAt: iso,
                      ...(e.target.value && !item.eventDate ? { eventDate: e.target.value.slice(0, 10) } : {}),
                    });
                  }}
                />
                <span className="fa-hint">Optional exact start time</span>
              </label>

              <label className="fa-field">
                <span className="fa-label">End Date &amp; Time</span>
                <input
                  className="fa-input"
                  type="datetime-local"
                  value={dtInput(item.endsAt)}
                  onChange={e => change({ endsAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                />
                <span className="fa-hint">Optional exact end time</span>
              </label>

              <label className="fa-field">
                <span className="fa-label">IANA Timezone</span>
                <select
                  className="fa-select"
                  value={item.timezone || 'Africa/Accra'}
                  onChange={e => change({ timezone: e.target.value })}
                >
                  {TIMEZONES.map(([tz, label]) => <option key={tz} value={tz}>{label}</option>)}
                </select>
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <label className="fa-field">
                <span className="fa-label">Time Display Label / Note</span>
                <input
                  className="fa-input"
                  value={item.timeLabel || ''}
                  onChange={e => change({ timeLabel: e.target.value })}
                  placeholder="e.g. 9:00 AM – 1:00 PM GMT or Time not specified"
                />
                <span className="fa-hint">Shown on event cards and detail header</span>
              </label>

              <label className="fa-field">
                <span className="fa-label">Event Format</span>
                <select
                  className="fa-select"
                  value={item.format || 'physical'}
                  onChange={e => change({ format: e.target.value })}
                >
                  <option value="physical">Physical / In-person</option>
                  <option value="virtual">Virtual / Online</option>
                  <option value="hybrid">Hybrid (In-person &amp; Online)</option>
                </select>
              </label>

              <label className="fa-field">
                <span className="fa-label">Venue / Location Summary</span>
                <input
                  className="fa-input"
                  value={item.venue || ''}
                  onChange={e => change({ venue: e.target.value })}
                  placeholder="e.g. Accra International Conference Centre or Online"
                />
              </label>
            </div>

            {(item.format === 'physical' || item.format === 'hybrid') && (
              <label className="fa-field">
                <span className="fa-label">Physical Street Address / Directions</span>
                <input
                  className="fa-input"
                  value={item.locationAddress || ''}
                  onChange={e => change({ locationAddress: e.target.value })}
                  placeholder="Full street address, building, room or city details"
                />
              </label>
            )}

            {(item.format === 'virtual' || item.format === 'hybrid') && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <label className="fa-field">
                  <span className="fa-label">Online Platform</span>
                  <input
                    className="fa-input"
                    value={item.onlinePlatform || ''}
                    onChange={e => change({ onlinePlatform: e.target.value })}
                    placeholder="e.g. Zoom, Microsoft Teams, Google Meet"
                  />
                </label>

                <label className="fa-field">
                  <span className="fa-label">Meeting Link (URL)</span>
                  <input
                    className="fa-input"
                    type="url"
                    value={item.meetingUrl || ''}
                    onChange={e => change({ meetingUrl: e.target.value })}
                    placeholder="https://zoom.us/j/..."
                  />
                </label>

                <label className="fa-field">
                  <span className="fa-label">Meeting Link Visibility</span>
                  <select
                    className="fa-select"
                    value={item.meetingAccess || 'private'}
                    onChange={e => change({ meetingAccess: e.target.value })}
                  >
                    <option value="private">Private — Restricted (hidden from public API)</option>
                    <option value="registered_only">Registered attendees only (hidden from public API)</option>
                    <option value="public">Public — Visible on event page</option>
                  </select>
                </label>
              </div>
            )}
          </div>

          <Toolbar editor={editor} onPickImage={() => setPicker('body')} />
          <div className="ed-surface">
            <EditorContent editor={editor} />
          </div>

          <footer className="ed-doc-footer">
            <span>{facts.words} {facts.words === 1 ? 'word' : 'words'}</span>
            <span>{facts.paragraphs} {facts.paragraphs === 1 ? 'paragraph' : 'paragraphs'}</span>
            <span>{facts.images} {facts.images === 1 ? 'image' : 'images'}</span>
          </footer>

          {/* Structured Event Sections below Rich-Text Editor */}
          <div style={{ marginTop: 28, display: 'grid', gap: 16 }}>
            {/* 1. Registration Management */}
            <details className="ed-panel" open style={{ border: '1px solid var(--fa-border, #e2e8f0)', borderRadius: 12, background: '#fff' }}>
              <summary style={{ padding: '14px 18px', fontWeight: 600 }}>
                Registration Settings
                <small style={{ marginLeft: 8, fontWeight: 400, color: 'var(--fa-text-muted)' }}>
                  {item.registrationMode === 'none'
                    ? 'No registration required'
                    : item.registrationMode === 'url'
                      ? 'External registration link'
                      : `CMS Form (${item.registrationFormKey || 'event_registration'})`}
                </small>
              </summary>
              <div style={{ padding: '0 18px 18px', display: 'grid', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  <label className="fa-field">
                    <span className="fa-label">Registration Mode</span>
                    <select
                      className="fa-select"
                      value={item.registrationMode || 'none'}
                      onChange={e => change({ registrationMode: e.target.value })}
                    >
                      <option value="none">No registration required</option>
                      <option value="url">External registration link</option>
                      <option value="form">CMS-hosted registration form</option>
                    </select>
                  </label>

                  {item.registrationMode !== 'none' && (
                    <label className="fa-field">
                      <span className="fa-label">Registration Button / Heading Label</span>
                      <input
                        className="fa-input"
                        value={item.registrationLabel || ''}
                        onChange={e => change({ registrationLabel: e.target.value })}
                        placeholder="Register for event"
                      />
                    </label>
                  )}
                </div>

                {item.registrationMode === 'url' && (
                  <label className="fa-field">
                    <span className="fa-label">External Registration URL</span>
                    <input
                      className="fa-input"
                      type="url"
                      value={item.registrationUrl || ''}
                      onChange={e => change({ registrationUrl: e.target.value })}
                      placeholder="https://..."
                    />
                    <span className="fa-hint">Must be a valid https:// or http:// link. Automatically hidden once the event is past or cancelled.</span>
                  </label>
                )}

                {item.registrationMode === 'form' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' }}>
                    <label className="fa-field">
                      <span className="fa-label">Attached CMS Registration Form</span>
                      <select
                        className="fa-select"
                        value={item.registrationFormKey || 'event_registration'}
                        onChange={e => change({ registrationFormKey: e.target.value })}
                      >
                        <option value="">Choose a published form…</option>
                        {publishedForms.map(f => (
                          <option key={f.formKey} value={f.formKey}>
                            {f.title} ({f.formKey})
                          </option>
                        ))}
                      </select>
                      <span className="fa-hint">
                        Submissions are saved privately in the database and reviewed in <a href="#/submissions">Submissions</a>.
                      </span>
                    </label>
                    <Button size="sm" variant="secondary" onClick={() => { window.location.hash = '#/forms'; }}>
                      Manage forms
                    </Button>
                  </div>
                )}

                {item.registrationMode !== 'none' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                      <label className="fa-field">
                        <span className="fa-label">Registration Opens At (Optional)</span>
                        <input
                          className="fa-input"
                          type="datetime-local"
                          value={dtInput(item.registrationOpenAt)}
                          onChange={e => change({ registrationOpenAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                        />
                      </label>

                      <label className="fa-field">
                        <span className="fa-label">Registration Closes At (Optional)</span>
                        <input
                          className="fa-input"
                          type="datetime-local"
                          value={dtInput(item.registrationCloseAt)}
                          onChange={e => change({ registrationCloseAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                        />
                      </label>
                    </div>

                    <Switch
                      checked={Boolean(item.registrationClosed)}
                      onChange={registrationClosed => change({ registrationClosed })}
                      label="Close registration manually"
                      hint="Immediately stops accepting new registrations even before the closing date."
                    />
                  </>
                )}
              </div>
            </details>

            {/* 2. Speakers & Facilitators */}
            <details className="ed-panel" open={Boolean(item.speakers?.length)} style={{ border: '1px solid var(--fa-border, #e2e8f0)', borderRadius: 12, background: '#fff' }}>
              <summary style={{ padding: '14px 18px', fontWeight: 600 }}>
                Speakers &amp; Facilitators
                <small style={{ marginLeft: 8, fontWeight: 400, color: 'var(--fa-text-muted)' }}>
                  {(item.speakers ?? []).length} {(item.speakers ?? []).length === 1 ? 'speaker' : 'speakers'}
                </small>
              </summary>
              <div style={{ padding: '0 18px 18px', display: 'grid', gap: 12 }}>
                {(item.speakers ?? []).map((sp, idx) => (
                  <div key={idx} style={{ border: '1px solid var(--fa-border, #e2e8f0)', borderRadius: 8, padding: 12, display: 'grid', gap: 10 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                      <input
                        className="fa-input"
                        placeholder="Speaker name *"
                        value={sp.name || ''}
                        onChange={e => {
                          const next = [...(item.speakers ?? [])];
                          next[idx] = { ...next[idx], name: e.target.value };
                          change({ speakers: next });
                        }}
                      />
                      <input
                        className="fa-input"
                        placeholder="Role / Title (e.g. Keynote Speaker)"
                        value={sp.role || ''}
                        onChange={e => {
                          const next = [...(item.speakers ?? [])];
                          next[idx] = { ...next[idx], role: e.target.value };
                          change({ speakers: next });
                        }}
                      />
                      <input
                        className="fa-input"
                        placeholder="Organisation"
                        value={sp.organisation || ''}
                        onChange={e => {
                          const next = [...(item.speakers ?? [])];
                          next[idx] = { ...next[idx], organisation: e.target.value };
                          change({ speakers: next });
                        }}
                      />
                    </div>
                    <textarea
                      className="fa-textarea"
                      rows={2}
                      placeholder="Short speaker bio (optional)"
                      value={sp.bio || ''}
                      onChange={e => {
                        const next = [...(item.speakers ?? [])];
                        next[idx] = { ...next[idx], bio: e.target.value };
                        change({ speakers: next });
                      }}
                    />
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1 }}>
                        <input
                          className="fa-input"
                          placeholder="Photo URL (optional)"
                          value={sp.photoUrl || ''}
                          onChange={e => {
                            const next = [...(item.speakers ?? [])];
                            next[idx] = { ...next[idx], photoUrl: e.target.value };
                            change({ speakers: next });
                          }}
                        />
                        <Button size="sm" variant="secondary" onClick={() => { setSpeakerPhotoIdx(idx); setPicker('speaker'); }}>
                          Media
                        </Button>
                      </div>
                      <Button
                        size="sm"
                        variant="danger"
                        icon={Trash2}
                        onClick={() => change({ speakers: (item.speakers ?? []).filter((_, i) => i !== idx) })}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
                <div>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={Plus}
                    onClick={() => change({ speakers: [...(item.speakers ?? []), { name: '', role: '', organisation: '', bio: '', photoUrl: '' }] })}
                  >
                    Add speaker or facilitator
                  </Button>
                </div>
              </div>
            </details>

            {/* 3. Event Agenda */}
            <details className="ed-panel" open={Boolean(item.agenda?.length)} style={{ border: '1px solid var(--fa-border, #e2e8f0)', borderRadius: 12, background: '#fff' }}>
              <summary style={{ padding: '14px 18px', fontWeight: 600 }}>
                Programme &amp; Agenda
                <small style={{ marginLeft: 8, fontWeight: 400, color: 'var(--fa-text-muted)' }}>
                  {(item.agenda ?? []).length} {(item.agenda ?? []).length === 1 ? 'session' : 'sessions'}
                </small>
              </summary>
              <div style={{ padding: '0 18px 18px', display: 'grid', gap: 12 }}>
                {(item.agenda ?? []).map((ag, idx) => (
                  <div key={idx} style={{ border: '1px solid var(--fa-border, #e2e8f0)', borderRadius: 8, padding: 12, display: 'grid', gap: 10 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 180px auto', gap: 10, alignItems: 'center' }}>
                      <input
                        className="fa-input"
                        placeholder="Time (e.g. 09:30)"
                        value={ag.time || ''}
                        onChange={e => {
                          const next = [...(item.agenda ?? [])];
                          next[idx] = { ...next[idx], time: e.target.value };
                          change({ agenda: next });
                        }}
                      />
                      <input
                        className="fa-input"
                        placeholder="Session title *"
                        value={ag.title || ''}
                        onChange={e => {
                          const next = [...(item.agenda ?? [])];
                          next[idx] = { ...next[idx], title: e.target.value };
                          change({ agenda: next });
                        }}
                      />
                      <input
                        className="fa-input"
                        placeholder="Speaker / Moderator"
                        value={ag.speaker || ''}
                        onChange={e => {
                          const next = [...(item.agenda ?? [])];
                          next[idx] = { ...next[idx], speaker: e.target.value };
                          change({ agenda: next });
                        }}
                      />
                      <Button
                        size="sm"
                        variant="danger"
                        icon={Trash2}
                        onClick={() => change({ agenda: (item.agenda ?? []).filter((_, i) => i !== idx) })}
                      >
                        Remove
                      </Button>
                    </div>
                    <input
                      className="fa-input"
                      placeholder="Session notes or description (optional)"
                      value={ag.description || ''}
                      onChange={e => {
                        const next = [...(item.agenda ?? [])];
                        next[idx] = { ...next[idx], description: e.target.value };
                        change({ agenda: next });
                      }}
                    />
                  </div>
                ))}
                <div>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={Plus}
                    onClick={() => change({ agenda: [...(item.agenda ?? []), { time: '', title: '', speaker: '', description: '' }] })}
                  >
                    Add agenda item
                  </Button>
                </div>
              </div>
            </details>

            {/* 4. Relevant Programme, Recording & Links */}
            <details className="ed-panel" open={Boolean(item.programmeId || item.recordingUrl || item.storyUrl)} style={{ border: '1px solid var(--fa-border, #e2e8f0)', borderRadius: 12, background: '#fff' }}>
              <summary style={{ padding: '14px 18px', fontWeight: 600 }}>
                Programme, Recording &amp; Related Links
              </summary>
              <div style={{ padding: '0 18px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <label className="fa-field">
                  <span className="fa-label">Relevant Programme</span>
                  <select
                    className="fa-select"
                    value={item.programmeId || ''}
                    onChange={e => {
                      const found = PROGRAMME_OPTIONS.find(([id]) => id === e.target.value);
                      change({
                        programmeId: e.target.value,
                        programmeLabel: found && e.target.value ? found[1] : item.programmeLabel,
                      });
                    }}
                  >
                    {PROGRAMME_OPTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </label>

                <label className="fa-field">
                  <span className="fa-label">Programme / Series Label</span>
                  <input
                    className="fa-input"
                    value={item.programmeLabel || ''}
                    onChange={e => change({ programmeLabel: e.target.value })}
                    placeholder="e.g. Entrepreneurial Development Workshop Series"
                  />
                </label>

                <label className="fa-field">
                  <span className="fa-label">Recording Link (Video / Audio)</span>
                  <input
                    className="fa-input"
                    type="url"
                    value={item.recordingUrl || ''}
                    onChange={e => change({ recordingUrl: e.target.value })}
                    placeholder="https://youtube.com/watch?v=..."
                  />
                </label>

                <label className="fa-field">
                  <span className="fa-label">Related Article / Story URL</span>
                  <input
                    className="fa-input"
                    value={item.storyUrl || ''}
                    onChange={e => change({ storyUrl: e.target.value })}
                    placeholder="/news/... or https://..."
                  />
                </label>

                <label className="fa-field">
                  <span className="fa-label">Source Label</span>
                  <input
                    className="fa-input"
                    value={item.sourceLabel || ''}
                    onChange={e => change({ sourceLabel: e.target.value })}
                    placeholder="e.g. Programme notice"
                  />
                </label>

                <label className="fa-field">
                  <span className="fa-label">Source URL</span>
                  <input
                    className="fa-input"
                    value={item.sourceUrl || ''}
                    onChange={e => change({ sourceUrl: e.target.value })}
                    placeholder="/emerging-entrepreneurs-programme/ or https://..."
                  />
                </label>
              </div>
            </details>

            {/* 5. Related Documents & Gallery */}
            <details className="ed-panel" open={Boolean(item.documents?.length || item.gallery?.length)} style={{ border: '1px solid var(--fa-border, #e2e8f0)', borderRadius: 12, background: '#fff' }}>
              <summary style={{ padding: '14px 18px', fontWeight: 600 }}>
                Related Documents &amp; Event Gallery
                <small style={{ marginLeft: 8, fontWeight: 400, color: 'var(--fa-text-muted)' }}>
                  {(item.documents ?? []).length} docs · {(item.gallery ?? []).length} photos
                </small>
              </summary>
              <div style={{ padding: '0 18px 18px', display: 'grid', gap: 18 }}>
                <div>
                  <strong style={{ display: 'block', fontSize: 13, marginBottom: 8 }}>Related Documents (Concept notes, programmes, communiqué PDFs)</strong>
                  {(item.documents ?? []).map((doc, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px auto', gap: 8, marginBottom: 8 }}>
                      <input
                        className="fa-input"
                        placeholder="Document title"
                        value={doc.title || ''}
                        onChange={e => {
                          const next = [...(item.documents ?? [])];
                          next[idx] = { ...next[idx], title: e.target.value };
                          change({ documents: next });
                        }}
                      />
                      <input
                        className="fa-input"
                        placeholder="Document URL (/media/... or https://...)"
                        value={doc.url || ''}
                        onChange={e => {
                          const next = [...(item.documents ?? [])];
                          next[idx] = { ...next[idx], url: e.target.value };
                          change({ documents: next });
                        }}
                      />
                      <input
                        className="fa-input"
                        placeholder="PDF"
                        value={doc.type || 'PDF'}
                        onChange={e => {
                          const next = [...(item.documents ?? [])];
                          next[idx] = { ...next[idx], type: e.target.value };
                          change({ documents: next });
                        }}
                      />
                      <Button
                        size="sm"
                        variant="danger"
                        icon={Trash2}
                        onClick={() => change({ documents: (item.documents ?? []).filter((_, i) => i !== idx) })}
                      />
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button size="sm" variant="secondary" icon={Plus} onClick={() => setPicker('document')}>
                      Select file from Media Library
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => change({ documents: [...(item.documents ?? []), { title: '', url: '', type: 'PDF' }] })}
                    >
                      Add external document link
                    </Button>
                  </div>
                </div>

                <div>
                  <strong style={{ display: 'block', fontSize: 13, marginBottom: 8 }}>Event Photo Gallery</strong>
                  {(item.gallery ?? []).length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 10 }}>
                      {(item.gallery ?? []).map((g, idx) => (
                        <div key={idx} style={{ border: '1px solid var(--fa-border)', borderRadius: 8, padding: 8, display: 'grid', gap: 6 }}>
                          <img src={g.url} alt={g.alt || ''} style={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 4 }} />
                          <input
                            className="fa-input"
                            placeholder="Caption"
                            value={g.caption || ''}
                            onChange={e => {
                              const next = [...(item.gallery ?? [])];
                              next[idx] = { ...next[idx], caption: e.target.value };
                              change({ gallery: next });
                            }}
                          />
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => change({ gallery: (item.gallery ?? []).filter((_, i) => i !== idx) })}
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button size="sm" variant="secondary" icon={ImageIcon} onClick={() => setPicker('gallery')}>
                    Add photo to gallery
                  </Button>
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>

      {panelOpen && (
        <aside className="ed-panel-rail" aria-label="Event settings">
          <div className="ed-rail-tabs">
            <Tabs
              label="Event settings"
              value={panelTab}
              onChange={setPanelTab}
              tabs={[
                { id: 'document', label: 'Event', icon: SlidersHorizontal },
                { id: 'seo', label: 'SEO', icon: Search },
                { id: 'history', label: 'History', icon: History, count: revisions.length },
                { id: 'gemini', label: 'Gemini', icon: Sparkles },
              ]}
            />
          </div>

          {panelTab === 'document' && (
            <>
              <Panel title="Publish">
                <div className="ed-status-row">
                  <span>Status</span>
                  <StatusChip status={item.status} />
                </div>
                {item.publishedAt && (
                  <div className="ed-status-row">
                    <span>{item.status === 'scheduled' ? 'Scheduled for' : 'Listing published'}</span>
                    <strong>{timeStr(item.publishedAt)}</strong>
                  </div>
                )}
                <label className="fa-field">
                  <span className="fa-label">Listing publication date</span>
                  <input
                    className="fa-input"
                    type="date"
                    value={dateInput(item.publishedAt)}
                    onChange={event => change({ publishedAt: event.target.value ? `${event.target.value}T12:00:00Z` : null })}
                  />
                  <span className="fa-hint">Controls when this listing is published (never used as the event date).</span>
                </label>

                <Switch
                  checked={Boolean(item.featured)}
                  onChange={featured => change({ featured })}
                  label="Feature this event"
                  hint="Pin near the top of the public Events page."
                />

                <div className="ed-state-actions">
                  {canPublish && item.status === 'published' && (
                    <Button size="sm" variant="secondary" onClick={() => changeState('draft')}>Switch to draft</Button>
                  )}
                  {canPublish && item.status === 'scheduled' && (
                    <Button size="sm" variant="secondary" onClick={() => changeState('draft')}>Cancel schedule</Button>
                  )}
                  {canPublish && item.status !== 'archived' && item.id && (
                    <Button size="sm" variant="ghost" onClick={() => changeState('archived')}>Archive</Button>
                  )}
                  {item.id && <Button size="sm" variant="ghost" onClick={duplicate}>Duplicate</Button>}
                  {canDelete && item.id && <Button size="sm" variant="danger" onClick={remove}>Delete</Button>}
                </div>
              </Panel>

              <Panel title="Event cancellation" open={Boolean(item.cancelled)}>
                <Switch
                  checked={Boolean(item.cancelled)}
                  onChange={cancelled => change({ cancelled })}
                  label="Mark event as cancelled"
                  hint="Displays a Cancelled badge on the public site and disables active registration."
                />
                {item.cancelled && (
                  <label className="fa-field" style={{ marginTop: 10 }}>
                    <span className="fa-label">Public cancellation notice</span>
                    <textarea
                      className="fa-textarea"
                      rows={2}
                      value={item.cancellationNote || ''}
                      onChange={e => change({ cancellationNote: e.target.value })}
                      placeholder="Optional note explaining postponement or cancellation…"
                    />
                  </label>
                )}
              </Panel>

              <Panel title="Summary / Excerpt" hint={`${(item.summary || '').length}/500`}>
                <textarea
                  className="fa-textarea"
                  rows={4}
                  maxLength={500}
                  value={item.summary || ''}
                  onChange={event => change({ summary: event.target.value })}
                  placeholder="A concise summary shown on event cards, previews and search results."
                />
              </Panel>

              <Panel title="Featured image / Poster">
                {item.image ? (
                  <div className="ed-featured">
                    <img
                      src={item.image}
                      alt={item.imageAlt || ''}
                      style={{ objectFit: item.imageFit === 'contain' ? 'contain' : 'cover', background: '#0f172a' }}
                    />
                    <div className="ed-featured-actions">
                      <Button size="sm" variant="secondary" onClick={() => setPicker('featured')}>Replace</Button>
                      <Button size="sm" variant="ghost" onClick={() => change({ featuredMediaId: null, image: '', imageAlt: '' })}>Remove</Button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="ed-image-drop" onClick={() => setPicker('featured')}>
                    Set featured event image
                  </button>
                )}
                <label className="fa-field" style={{ marginTop: 10 }}>
                  <span className="fa-label">Image frame fit</span>
                  <select
                    className="fa-select"
                    value={item.imageFit || 'cover'}
                    onChange={e => change({ imageFit: e.target.value })}
                  >
                    <option value="cover">Cover — fill card frame</option>
                    <option value="contain">Contain — show full event flyer/poster</option>
                  </select>
                </label>
              </Panel>

              <Panel title="Category &amp; tags">
                <label className="fa-field">
                  <span className="fa-label">Category</span>
                  <input
                    className="fa-input"
                    list="fa-event-category-list"
                    value={item.category || ''}
                    onChange={event => change({ category: event.target.value })}
                    placeholder="e.g. Emerging Entrepreneurs Programme"
                  />
                  <datalist id="fa-event-category-list">
                    {categories.map(name => <option key={name} value={name} />)}
                  </datalist>
                </label>
                <div className="fa-field">
                  <span className="fa-label">Tags</span>
                  <div className="ed-tags">
                    {(item.tags ?? []).map(tag => (
                      <span key={tag} className="fa-chip">
                        {tag}
                        <button
                          type="button"
                          aria-label={`Remove ${tag}`}
                          onClick={() => change({ tags: item.tags.filter(t => t !== tag) })}
                        >
                          <X aria-hidden="true" />
                        </button>
                      </span>
                    ))}
                    <input
                      value={tagDraft}
                      onChange={event => setTagDraft(event.target.value)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ',') {
                          event.preventDefault();
                          addTag();
                        }
                      }}
                      onBlur={addTag}
                      placeholder="Add tag…"
                    />
                  </div>
                </div>
              </Panel>
            </>
          )}

          {panelTab === 'seo' && (
            <Panel title="Search &amp; social sharing">
              <label className="fa-field">
                <span className="fa-label">SEO title <small>{(item.seoTitle || item.title).length}/60</small></span>
                <input
                  className="fa-input"
                  value={item.seoTitle || ''}
                  onChange={event => change({ seoTitle: event.target.value })}
                  placeholder={item.title || 'Defaults to the event title'}
                />
              </label>
              <label className="fa-field">
                <span className="fa-label">Meta description <small>{(item.seoDescription || item.summary).length}/160</small></span>
                <textarea
                  className="fa-textarea"
                  rows={3}
                  value={item.seoDescription || ''}
                  onChange={event => change({ seoDescription: event.target.value })}
                  placeholder={item.summary || 'Defaults to the event summary'}
                />
              </label>
              <div className="fa-field">
                <span className="fa-label">Social share image</span>
                {item.socialImage || item.image ? (
                  <div className="ed-featured">
                    <img src={item.socialImage || item.image} alt="" />
                    <div className="ed-featured-actions">
                      <Button size="sm" variant="secondary" onClick={() => setPicker('social')}>Choose image</Button>
                      {item.socialImageId && (
                        <Button size="sm" variant="ghost" onClick={() => change({ socialImageId: null, socialImage: '' })}>Use featured</Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <button type="button" className="ed-image-drop" onClick={() => setPicker('social')}>
                    Choose social image
                  </button>
                )}
              </div>
              <div className="ed-serp" aria-label="Search result preview">
                <small>foreignafrica.org/events/{item.slug || 'event-slug'}/</small>
                <strong>{item.seoTitle || item.title || 'Untitled event'} — Foreign Africa</strong>
                <p>{item.seoDescription || item.summary || 'Add a summary so search engines and social cards have a clear description.'}</p>
              </div>
            </Panel>
          )}

          {panelTab === 'history' && (
            <Panel title="Revision history" hint={revisions.length ? `${revisions.length} saved` : 'None yet'}>
              {!revisions.length && <p className="ed-muted">Revisions appear here each time this event is saved.</p>}
              <ol className="ed-revisions">
                {revisions.map(rev => (
                  <li key={rev.id}>
                    <div>
                      <strong>{rev.title || 'Untitled'}</strong>
                      <small>{rev.editorName} · {timeStr(rev.createdAt)}{rev.note ? ` · ${rev.note}` : ''}</small>
                      {rev.text && <p>{rev.text.slice(0, 120)}{rev.text.length > 120 ? '…' : ''}</p>}
                    </div>
                    {allows(user.roles, 'content.update.any') && (
                      <Button size="sm" variant="ghost" onClick={() => restore(rev.id)}>Restore</Button>
                    )}
                  </li>
                ))}
              </ol>
            </Panel>
          )}

          <div className="ed-gemini-host" hidden={panelTab !== 'gemini'}>
            <GeminiAssistant
              editor={editor}
              item={{ ...item, type: 'event' }}
              touch={change}
              addTag={tag => {
                const clean = String(tag || '').trim().replace(/,+$/, '');
                if (clean && !(item.tags ?? []).includes(clean)) {
                  change({ tags: [...(item.tags ?? []), clean] });
                }
              }}
              onClose={() => setPanelTab('document')}
              isExpanded={geminiWide}
              onToggleExpand={() => setGeminiWide(w => !w)}
            />
          </div>
        </aside>
      )}
    </div>

    {picker && (
      <MediaPicker
        user={user}
        accept={picker === 'document' ? 'pdf' : 'image'}
        onSelect={pickMedia}
        onClose={() => { setPicker(''); setSpeakerPhotoIdx(null); }}
      />
    )}
  </div>;
}
