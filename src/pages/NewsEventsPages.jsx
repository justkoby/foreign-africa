import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Clock3,
  MapPin,
  Mail,
  Video,
  FileText,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Users,
} from 'lucide-react';
import { events as staticEvents, eventUrl } from './events-content.js';
import { displayDate, eventState, listEvents } from './news-events-model.js';
import { usePublishedEvents, useEvent } from './use-published.js';
import './news-events.css';

export function Header({ page, title, description }) {
  return (
    <>
      <section className="ne-header">
        <div className="container">
          <nav aria-label="Breadcrumb">
            <a href="/">Home</a>
            <span aria-hidden="true">/</span>
            <span>{title}</span>
          </nav>
          <div className="ne-header-copy">
            <div>
              <p className="eyebrow">NEWS &amp; EVENTS</p>
              <h1>
                {title}
                <span>.</span>
              </h1>
            </div>
            <p>{description}</p>
          </div>
        </div>
      </section>
      <nav className="ne-section-nav" aria-label="News and events">
        <div className="container">
          <a href="/news/" aria-current={page === 'news' ? 'page' : undefined}>
            News &amp; updates
          </a>
          <a href="/events/" aria-current={page === 'events' ? 'page' : undefined}>
            Events
          </a>
        </div>
      </nav>
    </>
  );
}

export function NewsImage({ item }) {
  return (
    <div className={`ne-image ${item.imageFit === 'contain' ? 'ne-image--contain' : ''}`}>
      <img src={item.image} alt="" loading="lazy" />
    </div>
  );
}

export function NewsCard({ item }) {
  return (
    <article className="ne-news-card">
      <a href={item.url}>
        <NewsImage item={item} />
        <div>
          <p className="eyebrow">{item.category}</p>
          <time dateTime={item.publishedOn}>Published {displayDate(item.publishedOn)}</time>
          <h3>{item.title}</h3>
          <p>{item.summary}</p>
          <span className="ne-card-action">
            Read update <ArrowUpRight size={18} aria-hidden="true" />
          </span>
        </div>
      </a>
    </article>
  );
}

function formatEventTime(item) {
  if (item.timeLabel) return item.timeLabel;
  if (item.startsAt) {
    try {
      const tz = item.timezone || 'Africa/Accra';
      const fmt = new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: tz,
        timeZoneName: 'short',
      });
      const startStr = fmt.format(new Date(item.startsAt));
      if (item.endsAt) {
        const endFmt = new Intl.DateTimeFormat('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: tz,
          timeZoneName: 'short',
        });
        return `${startStr} – ${endFmt.format(new Date(item.endsAt))}`;
      }
      return startStr;
    } catch {
      return 'Time announced on page';
    }
  }
  return 'Time not specified';
}

function stateBadgeLabel(state) {
  if (state === 'cancelled') return 'Cancelled';
  if (state === 'ongoing') return 'Scheduled now';
  if (state === 'upcoming') return 'Upcoming';
  if (state === 'unannounced') return 'Date TBA';
  return 'Past announcement';
}

function EventCard({ item }) {
  const state = eventState(item);
  const rawDate = item.date || item.eventDate || (item.startsAt ? String(item.startsAt).slice(0, 10) : '');
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate);
  const href = `/events/${encodeURIComponent(item.slug || item.id)}/`;

  return (
    <article className="ne-event-card">
      <a href={href}>
        <div className="ne-event-date">
          {validDate ? (
            <>
              <strong>{rawDate.slice(8)}</strong>
              <span>
                {new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(
                  new Date(`${rawDate}T12:00:00Z`)
                )}
              </span>
              <small>{rawDate.slice(0, 4)}</small>
            </>
          ) : (
            <>
              <strong>TBA</strong>
              <span>Date</span>
              <small>Pending</small>
            </>
          )}
        </div>
        <div>
          <div className="ne-event-labels">
            <span className="eyebrow">{item.category || item.programmeLabel || 'Event'}</span>
            <span className={`ne-event-state ne-event-state--${state}`}>{stateBadgeLabel(state)}</span>
          </div>
          <h3>{item.title}</h3>
          <p>{item.summary}</p>
          <div className="ne-event-meta">
            <span>
              <Clock3 size={14} aria-hidden="true" />
              {formatEventTime(item)}
            </span>
            <span>
              <MapPin size={14} aria-hidden="true" />
              {item.venue || item.onlinePlatform || 'Venue TBA'}
            </span>
          </div>
          <span className="ne-card-action">
            View event details <ArrowUpRight size={17} aria-hidden="true" />
          </span>
        </div>
      </a>
    </article>
  );
}

function mergeEvents(liveItems, suppressedSlugs = []) {
  const suppressed = new Set(suppressedSlugs);
  const bySlug = new Map();
  for (const ev of staticEvents) {
    if (suppressed.has(ev.id)) continue;
    bySlug.set(ev.id, ev);
  }
  for (const live of liveItems) {
    const key = live.slug || live.id;
    if (!key) continue;
    const fallback = bySlug.get(key);
    bySlug.set(key, {
      ...(fallback || {}),
      ...live,
      id: key,
      slug: key,
      date: live.date || live.eventDate || fallback?.date || null,
      image: live.image || fallback?.image || '/images/join-community.jpg',
      details: live.details?.length ? live.details : fallback?.details || [],
    });
  }
  return [...bySlug.values()];
}

export function EventsPage() {
  const [view, setView] = useState('upcoming');
  const { items: liveItems, suppressedSlugs } = usePublishedEvents();
  const allEvents = useMemo(() => mergeEvents(liveItems, suppressedSlugs), [liveItems, suppressedSlugs]);

  const upcoming = useMemo(
    () => [
      ...listEvents(allEvents, 'upcoming'),
      ...allEvents.filter(item => eventState(item) === 'unannounced'),
    ],
    [allEvents]
  );
  const past = useMemo(
    () => [
      ...listEvents(allEvents, 'past'),
      ...allEvents.filter(item => eventState(item) === 'cancelled'),
    ],
    [allEvents]
  );
  const visible = view === 'past' ? past : upcoming;

  return (
    <div className="fa-inner-page news-events-page">
      <Header
        page="events"
        title="Events"
        description="Workshops, conversations and community gatherings connecting policy, enterprise and the people behind our work."
      />
      <section className="container ne-events">
        <div className="ne-events-heading">
          <div>
            <p className="eyebrow">THE EVENT CALENDAR</p>
            <h2>
              Make room for
              <br />
              the conversation.
            </h2>
          </div>
          <div className="ne-filters" role="group" aria-label="Event schedule">
            <button aria-pressed={view === 'upcoming'} onClick={() => setView('upcoming')}>
              Upcoming
            </button>
            <button aria-pressed={view === 'past'} onClick={() => setView('past')}>
              Past &amp; archive
            </button>
          </div>
        </div>
        {visible.length ? (
          <div className="ne-event-list">
            {visible.map(item => (
              <EventCard key={item.slug || item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="ne-event-empty">
            <CalendarDays size={35} strokeWidth={1.3} aria-hidden="true" />
            <div>
              <h3>No upcoming events listed.</h3>
              <p>
                New dates and participation details will appear here when published. Explore the past announcements or
                contact the team about future events.
              </p>
              <a className="text-link" href="mailto:info@foreignafrica.org?subject=Events%20enquiry">
                Ask about events <Mail size={16} aria-hidden="true" />
              </a>
            </div>
          </div>
        )}
        {view === 'upcoming' && past.length > 0 && (
          <div className="ne-past-preview">
            <div className="ne-archive-heading">
              <h2>Recent announcements</h2>
              <button className="text-link" onClick={() => setView('past')}>
                View the archive <ArrowRight size={17} aria-hidden="true" />
              </button>
            </div>
            <div className="ne-event-list">
              {past.slice(0, 3).map(item => (
                <EventCard key={item.slug || item.id} item={item} />
              ))}
            </div>
          </div>
        )}
        <p className="ne-schedule-note">
          Past announcements retain their published schedules. They do not confirm that an event took place or that a
          recording is available unless a recording link is provided.
        </p>
      </section>
      <section className="ne-contact">
        <div className="container">
          <h2>
            Stay connected
            <br />
            with our work.
          </h2>
          <div>
            <p>Explore the programmes and pathways behind our events.</p>
            <a className="button gold" href="/opportunities/">
              Explore opportunities <ArrowUpRight size={18} aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

function EventRegistrationForm({ eventSlug, form, label }) {
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);
  const [submitError, setSubmitError] = useState('');

  if (!form || !Array.isArray(form.fields) || !form.fields.length) return null;

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError('');
    setErrors({});
    try {
      const storageKey = `fa-ev-reg-${eventSlug}`;
      const key = sessionStorage.getItem(storageKey) || crypto.randomUUID();
      sessionStorage.setItem(storageKey, key);
      const response = await fetch(`/api/public/events/${encodeURIComponent(eventSlug)}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formId: form.id, answers: values, key }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrors(result.errors || {});
        setSubmitError(result.error || 'Your registration could not be submitted.');
        return;
      }
      setDone({
        message: result.success || form.successMessage || 'Thank you for registering.',
        reference: result.reference,
      });
    } catch {
      setSubmitError('Network error while submitting registration. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      id="event-registration"
      style={{
        marginTop: 36,
        padding: 28,
        borderRadius: 16,
        background: '#0f172a',
        color: '#f8fafc',
      }}
    >
      <p className="eyebrow" style={{ color: '#fbbf24', marginBottom: 6 }}>
        EVENT REGISTRATION
      </p>
      <h3 style={{ fontSize: 24, margin: '0 0 8px', color: '#fff' }}>{label || form.title || 'Register for this event'}</h3>
      {form.intro && <p style={{ color: '#cbd5e1', marginBottom: 20 }}>{form.intro}</p>}

      {done ? (
        <div
          role="status"
          style={{
            padding: 20,
            borderRadius: 12,
            background: 'rgba(16, 185, 129, 0.14)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            color: '#ecfdf5',
          }}
        >
          <strong style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, marginBottom: 6 }}>
            <CheckCircle2 size={18} /> Registration received
          </strong>
          <p style={{ margin: '0 0 6px' }}>{done.message}</p>
          {done.reference && <small style={{ color: '#a7f3d0' }}>Reference: {done.reference}</small>}
        </div>
      ) : (
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 16 }}>
          {form.fields.map(field => {
            const fieldKey = field.id || field.name;
            return (
              <label key={fieldKey} style={{ display: 'grid', gap: 6, fontSize: 14 }}>
                <span style={{ fontWeight: 600 }}>
                  {field.label}
                  {field.required ? ' *' : ''}
                </span>
                {field.type === 'textarea' ? (
                  <textarea
                    name={fieldKey}
                    required={field.required}
                    rows={3}
                    value={values[fieldKey] || ''}
                    onChange={ev => setValues(curr => ({ ...curr, [fieldKey]: ev.target.value }))}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid #334155',
                      background: '#1e293b',
                      color: '#fff',
                    }}
                  />
                ) : field.type === 'select' ? (
                  <select
                    name={fieldKey}
                    required={field.required}
                    value={values[fieldKey] || ''}
                    onChange={ev => setValues(curr => ({ ...curr, [fieldKey]: ev.target.value }))}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid #334155',
                      background: '#1e293b',
                      color: '#fff',
                    }}
                  >
                    <option value="">Choose…</option>
                    {(field.options || []).map(opt => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    name={fieldKey}
                    type={field.type || 'text'}
                    required={field.required}
                    value={values[fieldKey] || ''}
                    onChange={ev => setValues(curr => ({ ...curr, [fieldKey]: ev.target.value }))}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid #334155',
                      background: '#1e293b',
                      color: '#fff',
                    }}
                  />
                )}
                {errors[fieldKey] && <span style={{ color: '#fca5a5', fontSize: 13 }}>{errors[fieldKey]}</span>}
              </label>
            );
          })}
          {form.consentLabel && (
            <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>{form.consentLabel}</p>
          )}
          {submitError && (
            <p role="alert" style={{ color: '#fca5a5', margin: 0, fontSize: 14 }}>
              {submitError}
            </p>
          )}
          <div>
            <button className="button gold" type="submit" disabled={submitting}>
              {submitting ? 'Submitting…' : label || 'Submit registration'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export function EventDetailPage({ id }) {
  const staticFallback = staticEvents.find(event => event.id === id);
  const { item: liveItem, status } = useEvent(id);

  const item = useMemo(() => {
    if (liveItem) {
      return {
        ...(staticFallback || {}),
        ...liveItem,
        date: liveItem.date || liveItem.eventDate || staticFallback?.date || null,
        image: liveItem.image || staticFallback?.image || '/images/join-community.jpg',
        details: liveItem.details?.length ? liveItem.details : staticFallback?.details || [],
      };
    }
    return staticFallback || null;
  }, [liveItem, staticFallback]);

  if (!item && status === 'loading') {
    return (
      <div className="fa-inner-page news-events-page">
        <section className="container" style={{ padding: '80px 0' }}>
          <p>Loading event details…</p>
        </section>
      </div>
    );
  }

  if (!item) return <EventsPage />;

  const state = eventState(item);
  const isPast = state === 'past';
  const isCancelled = Boolean(item.cancelled) || state === 'cancelled';
  const regOpen = !isPast && !isCancelled && Boolean(item.registrationStatus?.open);
  const formatText =
    item.format === 'virtual' ? 'Virtual / Online' : item.format === 'hybrid' ? 'Hybrid (In-person & Online)' : 'In-person';

  return (
    <div className="fa-inner-page news-events-page">
      <section className="ne-event-hero">
        <div className="container">
          <a className="ne-back" href="/events/">
            <ArrowLeft size={15} aria-hidden="true" />
            All events
          </a>
          {isCancelled && (
            <div
              role="status"
              style={{
                background: 'rgba(239, 68, 68, 0.16)',
                border: '1px solid rgba(239, 68, 68, 0.45)',
                color: '#fecaca',
                padding: '12px 16px',
                borderRadius: 10,
                marginBottom: 18,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <AlertTriangle size={18} />
              <div>
                <strong>This event has been cancelled.</strong>
                {item.cancellationNote ? ` ${item.cancellationNote}` : ''}
              </div>
            </div>
          )}
          <div className="ne-event-hero-grid">
            <div>
              <p className="eyebrow">
                {item.category || item.programmeLabel || 'Event'} /{' '}
                {isCancelled ? 'CANCELLED' : isPast ? 'PAST ANNOUNCEMENT' : 'EVENT ANNOUNCEMENT'}
              </p>
              <h1>{item.title}</h1>
              <p>{item.summary}</p>
            </div>
            <aside>
              <p className="eyebrow">ANNOUNCED SCHEDULE</p>
              <p>
                <CalendarDays size={18} aria-hidden="true" />
                {displayDate(item.date || item.eventDate)}
              </p>
              <p>
                <Clock3 size={18} aria-hidden="true" />
                {formatEventTime(item)}
                {item.timezone && item.timezone !== 'Africa/Accra' ? ` (${item.timezone})` : ''}
              </p>
              <p>
                {item.format === 'virtual' ? <Video size={18} aria-hidden="true" /> : <MapPin size={18} aria-hidden="true" />}
                {item.venue || item.onlinePlatform || formatText}
              </p>
              {item.locationAddress && (
                <p style={{ fontSize: 13, opacity: 0.85 }}>{item.locationAddress}</p>
              )}
              {item.meetingUrl && item.meetingAccess === 'public' && !isPast && !isCancelled && (
                <p>
                  <a className="text-link" href={item.meetingUrl} target="_blank" rel="noreferrer">
                    Join online session <ExternalLink size={15} aria-hidden="true" />
                  </a>
                </p>
              )}
              {item.meetingRestricted && !isPast && !isCancelled && (
                <p style={{ fontSize: 13, opacity: 0.85 }}>
                  Online joining link is provided privately to registered attendees.
                </p>
              )}

              {/* Registration CTA logic: strictly disabled for past or cancelled events */}
              {isCancelled ? (
                <div className="ne-registration-note">
                  This event has been cancelled. Registration is closed.
                </div>
              ) : isPast ? (
                <div className="ne-registration-note">
                  This announced date has passed. Registration is unavailable on this page.
                </div>
              ) : regOpen && item.registrationMode === 'url' && item.registrationUrl ? (
                <div style={{ margin: '14px 0' }}>
                  <a className="button gold" href={item.registrationUrl} target="_blank" rel="noreferrer">
                    {item.registrationLabel || 'Register for event'} <ArrowUpRight size={17} aria-hidden="true" />
                  </a>
                </div>
              ) : regOpen && item.registrationMode === 'form' && item.registrationForm ? (
                <div style={{ margin: '14px 0' }}>
                  <a className="button gold" href="#event-registration">
                    {item.registrationLabel || 'Register for event'} <ArrowRight size={17} aria-hidden="true" />
                  </a>
                </div>
              ) : item.registrationMode && item.registrationMode !== 'none' ? (
                <div className="ne-registration-note">
                  {item.registrationStatus?.reason === 'not_yet_open'
                    ? 'Registration for this event opens soon.'
                    : 'Registration for this event is closed.'}
                </div>
              ) : (
                <div className="ne-registration-note">Registration details are not listed on this page.</div>
              )}

              {item.recordingUrl && (
                <p style={{ marginTop: 10 }}>
                  <a className="text-link" href={item.recordingUrl} target="_blank" rel="noreferrer">
                    Watch event recording <ExternalLink size={15} aria-hidden="true" />
                  </a>
                </p>
              )}

              <a
                className="text-link"
                href={`mailto:info@foreignafrica.org?subject=${encodeURIComponent('Enquiry: ' + item.title)}`}
              >
                Ask the team <Mail size={16} aria-hidden="true" />
              </a>
            </aside>
          </div>
        </div>
      </section>

      <section className="container ne-event-body">
        {item.image && (
          <figure>
            <img
              src={item.image}
              alt={item.imageAlt || `${item.title} announcement`}
              loading="lazy"
              style={item.imageFit === 'contain' ? { objectFit: 'contain', background: '#0f172a' } : undefined}
            />
            {item.sourceLabel && <figcaption>{item.sourceLabel}</figcaption>}
          </figure>
        )}
        <div>
          <p className="eyebrow">ABOUT THE EVENT</p>
          <h2>
            The conversation
            <br />
            in focus.
          </h2>
          {item.html ? (
            <div className="fa-rich-content" dangerouslySetInnerHTML={{ __html: item.html }} />
          ) : (
            (item.details || []).map(text => <p key={text}>{text}</p>)
          )}

          {/* Speakers & Facilitators */}
          {Array.isArray(item.speakers) && item.speakers.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <p className="eyebrow">SPEAKERS &amp; FACILITATORS</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginTop: 12 }}>
                {item.speakers.map((sp, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: 16,
                      borderRadius: 12,
                      border: '1px solid rgba(15, 23, 42, 0.12)',
                      background: '#f8fafc',
                    }}
                  >
                    <strong style={{ display: 'block', fontSize: 16 }}>{sp.name}</strong>
                    {(sp.role || sp.organisation) && (
                      <small style={{ display: 'block', color: '#475569', marginTop: 2 }}>
                        {[sp.role, sp.organisation].filter(Boolean).join(' · ')}
                      </small>
                    )}
                    {sp.bio && <p style={{ fontSize: 14, marginTop: 8, marginBottom: 0 }}>{sp.bio}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Agenda */}
          {Array.isArray(item.agenda) && item.agenda.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <p className="eyebrow">PROGRAMME AGENDA</p>
              <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                {item.agenda.map((ag, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '12px 16px',
                      borderRadius: 10,
                      border: '1px solid rgba(15, 23, 42, 0.1)',
                      background: '#fff',
                      display: 'grid',
                      gridTemplateColumns: ag.time ? '110px 1fr' : '1fr',
                      gap: 12,
                    }}
                  >
                    {ag.time && <strong style={{ color: '#0f172a' }}>{ag.time}</strong>}
                    <div>
                      <strong style={{ display: 'block' }}>{ag.title}</strong>
                      {ag.speaker && <small style={{ color: '#475569' }}>{ag.speaker}</small>}
                      {ag.description && <p style={{ margin: '6px 0 0', fontSize: 14 }}>{ag.description}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Related Documents */}
          {Array.isArray(item.documents) && item.documents.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <p className="eyebrow">RELATED DOCUMENTS</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
                {item.documents.map((doc, idx) => (
                  <a
                    key={idx}
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-link"
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: '1px solid rgba(15, 23, 42, 0.15)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <FileText size={16} aria-hidden="true" />
                    {doc.title} ({doc.type || 'PDF'})
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Gallery */}
          {Array.isArray(item.gallery) && item.gallery.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <p className="eyebrow">EVENT GALLERY</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginTop: 10 }}>
                {item.gallery.map((g, idx) => (
                  <figure key={idx} style={{ margin: 0 }}>
                    <img src={g.url} alt={g.alt || item.title} style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 8 }} />
                    {g.caption && <figcaption style={{ fontSize: 12, marginTop: 4 }}>{g.caption}</figcaption>}
                  </figure>
                ))}
              </div>
            </div>
          )}

          {/* Embedded CMS Registration Form when open */}
          {regOpen && item.registrationMode === 'form' && item.registrationForm && (
            <EventRegistrationForm
              eventSlug={item.slug || item.id}
              form={item.registrationForm}
              label={item.registrationLabel}
            />
          )}

          {item.storyUrl && (
            <p style={{ marginTop: 20 }}>
              <a className="text-link" href={item.storyUrl}>
                Read the programme update <ArrowUpRight size={17} aria-hidden="true" />
              </a>
            </p>
          )}
          <p className="ne-source-note">
            The schedule and session details are published by Foreign Africa. For media or participation enquiries,
            contact the secretariat.
          </p>
          <a className="text-link" href="/events/">
            Back to events <ArrowRight size={17} aria-hidden="true" />
          </a>
        </div>
      </section>
    </div>
  );
}
