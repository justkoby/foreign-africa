import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Archive, Ban, Calendar, CheckCircle2, Copy, ExternalLink, Eye, MapPin, MoreHorizontal, Pencil, Plus, Trash2, Undo2, Video} from 'lucide-react';
import {allows} from '../../server/permissions.js';
import {api} from './api.js';
import {Button, Card, Chip, EmptyState, IconButton, Menu, MenuItem, MenuSeparator, Notice, PageHeader, Pagination, SearchField, Select, Skeleton, StatusChip, Tabs, ago, fmtDate, useFeedback} from './ui/index.jsx';

const tabs = [
  ['', 'All'],
  ['published', 'Published'],
  ['draft', 'Drafts'],
  ['scheduled', 'Scheduled'],
  ['cancelled', 'Cancelled'],
  ['archived', 'Archived'],
];

const formatLabels = {
  physical: 'In-person',
  virtual: 'Virtual',
  hybrid: 'Hybrid',
};

const scheduleBadges = {
  upcoming: {label: 'Upcoming', tone: 'success'},
  ongoing: {label: 'Happening now', tone: 'info'},
  past: {label: 'Past event', tone: 'neutral'},
  cancelled: {label: 'Cancelled', tone: 'danger'},
  unannounced: {label: 'Date TBA', tone: 'warning'},
};

export default function EventsList({user}) {
  const {toast, confirm} = useFeedback();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState({q: '', status: '', schedule: 'all', sort: 'event_date_desc', page: 1, size: 20});
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(() => new Set());

  const publisher = allows(user.roles, 'content.publish');
  const remover = allows(user.roles, 'content.delete');
  const creator = allows(user.roles, 'content.create');
  const alive = useRef(true);

  useEffect(() => () => { alive.current = false; }, []);
  useEffect(() => {
    const timer = setTimeout(() => setState(s => ({...s, q: query, page: 1})), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(() => {
    const params = new URLSearchParams({
      q: state.q,
      status: state.status,
      schedule: state.schedule,
      sort: state.sort,
      page: String(state.page),
      pageSize: String(state.size),
    });
    return api(`/api/staff/events?${params.toString()}`)
      .then(next => {
        if (alive.current) {
          setData(next);
          setError('');
        }
      })
      .catch(reason => alive.current && setError(reason.message));
  }, [state]);

  useEffect(() => {
    setSelected(new Set());
    load();
  }, [load]);

  const items = data?.items ?? [];
  const everything = Boolean(items.length) && items.every(item => selected.has(item.id));
  const toggle = id => setSelected(previous => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const counts = data?.counts ?? {};
  const totalCount = Object.entries(counts)
    .filter(([key]) => key !== 'cancelled')
    .reduce((sum, [, n]) => sum + n, 0);

  async function bulk(action) {
    if (action === 'delete' && !(await confirm({
      title: `Delete ${selected.size} ${selected.size === 1 ? 'event' : 'events'}?`,
      message: 'They will no longer appear in the Studio or on the website. This cannot be undone from here.',
      confirm: 'Delete',
      danger: true,
    }))) return;
    if (action === 'cancel' && !(await confirm({
      title: `Cancel ${selected.size} ${selected.size === 1 ? 'event' : 'events'}?`,
      message: 'Cancelled events display a Cancelled notice on the public site and automatically close active registrations.',
      confirm: 'Cancel events',
      danger: true,
    }))) return;

    setBusy(true);
    try {
      const {results} = await api('/api/staff/events/bulk', {method: 'POST', body: {action, ids: [...selected]}});
      const failed = results.filter(result => !result.ok);
      toast(
        failed.length
          ? `${results.length - failed.length} updated, ${failed.length} not changed: ${[...new Set(failed.map(result => result.error))].join(' ')}`
          : `${results.length} ${results.length === 1 ? 'event' : 'events'} updated.`,
        failed.length ? 'error' : 'success'
      );
      setSelected(new Set());
      await load();
    } catch (reason) {
      toast(reason.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function duplicate(item) {
    try {
      const copy = await api(`/api/staff/events/${item.id}/duplicate`, {method: 'POST', body: {}});
      toast('Event duplicated as a draft.');
      window.location.hash = `#/events/${copy.item.id}`;
    } catch (reason) {
      toast(reason.message, 'error');
    }
  }

  async function toggleCancel(item) {
    const nextCancelled = !item.cancelled;
    if (nextCancelled && !(await confirm({
      title: `Cancel "${item.title}"?`,
      message: 'This marks the event as cancelled and disables active registration links or forms.',
      confirm: 'Mark as cancelled',
      danger: true,
    }))) return;
    try {
      await api(`/api/staff/events/${item.id}/state`, {
        method: 'POST',
        body: {cancelled: nextCancelled},
      });
      toast(nextCancelled ? 'Event marked as cancelled.' : 'Event restored to active schedule.');
      await load();
    } catch (reason) {
      toast(reason.message, 'error');
    }
  }

  return <div className="fa-page">
    <PageHeader
      title="Events"
      subtitle="Conferences, workshops, cohort convenings, webinars and public briefings."
      actions={
        <div style={{display: 'flex', gap: 10, alignItems: 'center'}}>
          <Button variant="secondary" onClick={() => { window.location.hash = '#/forms'; }}>Registration forms</Button>
          {creator && <Button variant="primary" icon={Plus} onClick={() => { window.location.hash = '#/events/new'; }}>New event</Button>}
        </div>
      }
    />
    <Card>
      <div style={{padding: '6px 18px 0'}}>
        <Tabs
          label="Filter by status"
          value={state.status}
          onChange={status => setState(s => ({...s, status, page: 1}))}
          tabs={tabs.map(([id, label]) => ({
            id,
            label,
            count: data ? (id ? counts[id] ?? 0 : totalCount) : null,
          }))}
        />
      </div>
      <div className="fa-toolbar">
        <div style={{width: 'min(340px,100%)'}}>
          <SearchField value={query} onChange={setQuery} placeholder="Search events, venues, programmes…" label="Search Events"/>
        </div>
        <Select pill aria-label="Schedule filter" value={state.schedule} onChange={event => setState(s => ({...s, schedule: event.target.value, page: 1}))}>
          <option value="all">All event dates</option>
          <option value="upcoming">Upcoming &amp; ongoing</option>
          <option value="past">Past events</option>
          <option value="unannounced">Date TBA</option>
        </Select>
        <Select pill aria-label="Sort" value={state.sort} onChange={event => setState(s => ({...s, sort: event.target.value, page: 1}))}>
          <option value="event_date_desc">Event date (newest)</option>
          <option value="event_date_asc">Event date (oldest)</option>
          <option value="updated">Recently edited</option>
          <option value="title">Title A–Z</option>
        </Select>
        {(state.q || state.status || state.schedule !== 'all') && (
          <Button variant="ghost" size="sm" onClick={() => { setQuery(''); setState(s => ({...s, q: '', status: '', schedule: 'all', page: 1})); }}>
            Clear filters
          </Button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="fa-bulk" role="toolbar" aria-label="Bulk actions">
          <strong>{selected.size} selected</strong>
          {publisher && (
            <>
              <Button size="sm" icon={Eye} disabled={busy} onClick={() => bulk('publish')}>Publish</Button>
              <Button size="sm" icon={Undo2} disabled={busy} onClick={() => bulk('unpublish')}>Move to draft</Button>
              <Button size="sm" icon={Ban} disabled={busy} onClick={() => bulk('cancel')}>Cancel event</Button>
              <Button size="sm" icon={CheckCircle2} disabled={busy} onClick={() => bulk('uncancel')}>Restore schedule</Button>
              <Button size="sm" icon={Archive} disabled={busy} onClick={() => bulk('archive')}>Archive</Button>
            </>
          )}
          {remover && <Button size="sm" variant="danger" icon={Trash2} disabled={busy} onClick={() => bulk('delete')}>Delete</Button>}
          <Button size="sm" variant="ghost" className="fa-spacer" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {error && <div style={{padding: '0 18px 14px'}}><Notice tone="danger" title="Could not load events">{error}</Notice></div>}

      <div className="fa-tablewrap">
        <table className="fa-table">
          <thead>
            <tr>
              <th className="is-check">
                <input
                  type="checkbox"
                  className="fa-check"
                  aria-label="Select all on this page"
                  checked={everything}
                  onChange={event => setSelected(event.target.checked ? new Set(items.map(item => item.id)) : new Set())}
                />
              </th>
              <th>Event</th>
              <th>Event Date &amp; Schedule</th>
              <th>Format &amp; Venue</th>
              <th>Registration</th>
              <th>Status</th>
              <th className="is-actions"><span className="fa-sr">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {!data && !error && [0, 1, 2, 3].map(row => (
              <tr key={row}>
                <td/>
                <td><div className="fa-title-cell"><Skeleton width={52} height={52}/><Skeleton width="60%" height={14}/></div></td>
                <td><Skeleton width={110} height={14}/></td>
                <td><Skeleton width={110} height={14}/></td>
                <td><Skeleton width={90} height={22}/></td>
                <td><Skeleton width={70} height={22}/></td>
                <td/>
              </tr>
            ))}
            {items.map(item => {
              const sched = scheduleBadges[item.scheduleState] ?? scheduleBadges.upcoming;
              const regOpen = item.registrationStatus?.open;
              return (
                <tr key={item.id} className={selected.has(item.id) ? 'is-selected' : ''}>
                  <td className="is-check">
                    <input
                      type="checkbox"
                      className="fa-check"
                      aria-label={`Select ${item.title}`}
                      checked={selected.has(item.id)}
                      onChange={() => toggle(item.id)}
                    />
                  </td>
                  <td>
                    <div className="fa-title-cell">
                      {item.image
                        ? <img className="fa-thumb" src={item.image} alt="" loading="lazy"/>
                        : <span className="fa-thumb"><Calendar aria-hidden="true"/></span>}
                      <div className="fa-title-text">
                        <a href={`#/events/${item.id}`}>{item.title}</a>
                        <small>
                          /events/{item.slug}/
                          {item.category ? ` · ${item.category}` : ''}
                          {item.featured ? ' · Featured' : ''}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="fa-date">
                      {item.eventDate ? fmtDate(item.eventDate) : (item.startsAt ? fmtDate(item.startsAt) : 'Date TBA')}
                      <small style={{display: 'flex', alignItems: 'center', gap: 6, marginTop: 2}}>
                        <Chip tone={sched.tone}>{sched.label}</Chip>
                        {item.timeLabel ? <span>{item.timeLabel}</span> : null}
                      </small>
                    </span>
                  </td>
                  <td>
                    <span className="fa-date">
                      <span style={{display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 500}}>
                        {item.format === 'virtual' ? <Video size={13}/> : <MapPin size={13}/>}
                        {formatLabels[item.format] || 'In-person'}
                      </span>
                      <small>{item.venue || item.onlinePlatform || 'Venue TBA'}</small>
                    </span>
                  </td>
                  <td>
                    {item.registrationMode === 'none' ? (
                      <span className="fa-dash">None required</span>
                    ) : item.registrationMode === 'url' ? (
                      <Chip tone={regOpen ? 'info' : 'neutral'}>
                        {regOpen ? 'External link · Open' : `Link · ${item.registrationStatus?.label || 'Closed'}`}
                      </Chip>
                    ) : (
                      <Chip tone={regOpen ? 'success' : 'neutral'}>
                        {regOpen ? 'CMS Form · Open' : `Form · ${item.registrationStatus?.label || 'Closed'}`}
                      </Chip>
                    )}
                  </td>
                  <td>
                    <div style={{display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start'}}>
                      <StatusChip status={item.status}/>
                      <small style={{color: 'var(--fa-text-muted)', fontSize: 11}}>Edited {ago(item.updatedAt)}</small>
                    </div>
                  </td>
                  <td className="is-actions">
                    <Menu
                      label={`Actions for ${item.title}`}
                      trigger={({toggle: open, props}) => <IconButton icon={MoreHorizontal} label="Row actions" onClick={open} {...props}/>}
                    >
                      <MenuItem icon={Pencil} href={`#/events/${item.id}`}>Edit event</MenuItem>
                      <MenuItem icon={Eye} href={`/api/staff/events/${item.id}/preview`} target="_blank" rel="noreferrer">Preview</MenuItem>
                      {item.status === 'published' && (
                        <MenuItem icon={ExternalLink} href={`/events/${item.slug}/`} target="_blank" rel="noreferrer">View on website</MenuItem>
                      )}
                      {publisher && (
                        <>
                          <MenuSeparator/>
                          <MenuItem icon={item.cancelled ? CheckCircle2 : Ban} onClick={() => toggleCancel(item)}>
                            {item.cancelled ? 'Restore event schedule' : 'Mark event as cancelled'}
                          </MenuItem>
                        </>
                      )}
                      {creator && (
                        <>
                          <MenuSeparator/>
                          <MenuItem icon={Copy} onClick={() => duplicate(item)}>Duplicate</MenuItem>
                        </>
                      )}
                    </Menu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {data && !items.length && !error && (
          state.q || state.status || state.schedule !== 'all' ? (
            <EmptyState
              icon={Calendar}
              title="No matching events"
              action={<Button onClick={() => { setQuery(''); setState(s => ({...s, q: '', status: '', schedule: 'all', page: 1})); }}>Clear filters</Button>}
            >
              Nothing matches your search or filter. Try a different keyword, status or schedule filter.
            </EmptyState>
          ) : (
            <EmptyState
              icon={Calendar}
              title="No events yet"
              action={creator && <Button variant="primary" icon={Plus} onClick={() => { window.location.hash = '#/events/new'; }}>Create the first event</Button>}
            >
              Create and manage Foreign Africa conferences, workshops, cohort milestones and webinars directly from the Studio.
            </EmptyState>
          )
        )}
      </div>
      {data && data.total > 0 && (
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onPage={page => setState(s => ({...s, page}))}
          onPageSize={size => setState(s => ({...s, size, page: 1}))}
        />
      )}
    </Card>
  </div>;
}
