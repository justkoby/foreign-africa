import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Archive, Copy, ExternalLink, Eye, FileText, MoreHorizontal, Newspaper, Pencil, Plus, Trash2, Undo2} from 'lucide-react';
import {allows} from '../../server/permissions.js';
import {api} from './api.js';
import {Avatar, Button, Card, Chip, EmptyState, IconButton, Menu, MenuItem, MenuSeparator, Notice, PageHeader, Pagination, SearchField, Select, Skeleton, StatusChip, Tabs, ago, fmtDate, useFeedback} from './ui/index.jsx';

const labels = {news: {plural: 'News', singular: 'news article', blurb: 'Announcements, reports and updates from Foreign Africa.'}, commentary: {plural: 'Commentaries', singular: 'commentary', blurb: 'Analysis and perspectives written by the team and partners.'}, page: {plural: 'Pages', singular: 'page', blurb: 'Standing pages such as About and Careers.'}, programme: {plural: 'Programmes', singular: 'programme', blurb: 'Programme and initiative pages.'}};
const liveUrl = item => (item.type === 'news' ? `/news/${item.slug}/` : `/${item.slug}/`);
const tabs = [['', 'All'], ['published', 'Published'], ['draft', 'Drafts'], ['scheduled', 'Scheduled'], ['archived', 'Archived']];

export default function ContentList({type, user}) {
  const text = labels[type] ?? {plural: 'Content', singular: 'item', blurb: ''};
  const {toast, confirm} = useFeedback();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState({q: '', status: '', sort: 'updated', page: 1, size: 20});
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const publisher = allows(user.roles, 'content.publish');
  const remover = allows(user.roles, 'content.delete');
  const creator = allows(user.roles, 'content.create');
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  useEffect(() => { const timer = setTimeout(() => setState(s => ({...s, q: query, page: 1})), 250); return () => clearTimeout(timer); }, [query]);
  useEffect(() => { setState(s => ({...s, status: '', page: 1})); setQuery(''); }, [type]);
  const load = useCallback(() => api(`/api/staff/content?type=${type}&q=${encodeURIComponent(state.q)}&status=${state.status}&sort=${state.sort}&page=${state.page}&pageSize=${state.size}`).then(next => { if (alive.current) { setData(next); setError(''); } }).catch(reason => alive.current && setError(reason.message)), [type, state]);
  useEffect(() => { setSelected(new Set()); load(); }, [load]);

  const items = data?.items ?? [];
  const everything = Boolean(items.length) && items.every(item => selected.has(item.id));
  const toggle = id => setSelected(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const counts = data?.counts ?? {};
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  async function bulk(action) {
    if (action === 'delete' && !(await confirm({title: `Delete ${selected.size} ${selected.size === 1 ? 'item' : 'items'}?`, message: 'They will no longer appear in the Studio or on the website. This cannot be undone from here.', confirm: 'Delete', danger: true}))) return;
    setBusy(true);
    try {
      const {results} = await api('/api/staff/content/bulk', {method: 'POST', body: {action, ids: [...selected]}});
      const failed = results.filter(result => !result.ok);
      toast(failed.length ? `${results.length - failed.length} updated, ${failed.length} not changed: ${[...new Set(failed.map(result => result.error))].join(' ')}` : `${results.length} ${results.length === 1 ? 'item' : 'items'} updated.`, failed.length ? 'error' : 'success');
      setSelected(new Set()); await load();
    } catch (reason) { toast(reason.message, 'error'); } finally { setBusy(false); }
  }
  async function duplicate(item) {
    try { const copy = await api(`/api/staff/content/${item.id}/duplicate`, {method: 'POST', body: {}}); toast('Duplicated as a draft.'); window.location.hash = `#/content/${type}/${copy.item.id}`; } catch (reason) { toast(reason.message, 'error'); }
  }

  return <div className="fa-page">
    <PageHeader title={text.plural} subtitle={text.blurb} actions={creator && <Button variant="primary" icon={Plus} onClick={() => { window.location.hash = `#/content/${type}/new`; }}>New {text.singular}</Button>}/>
    <Card>
      <div style={{padding: '6px 18px 0'}}><Tabs label="Filter by status" value={state.status} onChange={status => setState(s => ({...s, status, page: 1}))} tabs={tabs.map(([id, label]) => ({id, label, count: data ? (id ? counts[id] ?? 0 : total) : null}))}/></div>
      <div className="fa-toolbar">
        <div style={{width: 'min(360px,100%)'}}><SearchField value={query} onChange={setQuery} placeholder={`Search ${text.plural.toLowerCase()}…`} label={`Search ${text.plural}`}/></div>
        <Select pill aria-label="Sort" value={state.sort} onChange={event => setState(s => ({...s, sort: event.target.value, page: 1}))}><option value="updated">Recently edited</option><option value="published">Publication date</option><option value="title">Title A–Z</option></Select>
        {(state.q || state.status) && <Button variant="ghost" size="sm" onClick={() => { setQuery(''); setState(s => ({...s, q: '', status: '', page: 1})); }}>Clear filters</Button>}
      </div>
      {selected.size > 0 && <div className="fa-bulk" role="toolbar" aria-label="Bulk actions"><strong>{selected.size} selected</strong>
        {publisher && <><Button size="sm" icon={Eye} disabled={busy} onClick={() => bulk('publish')}>Publish</Button><Button size="sm" icon={Undo2} disabled={busy} onClick={() => bulk('unpublish')}>Move to draft</Button><Button size="sm" icon={Archive} disabled={busy} onClick={() => bulk('archive')}>Archive</Button></>}
        {remover && <Button size="sm" variant="danger" icon={Trash2} disabled={busy} onClick={() => bulk('delete')}>Delete</Button>}
        {!publisher && !remover && <span>Your role cannot change these in bulk.</span>}<Button size="sm" variant="ghost" className="fa-spacer" onClick={() => setSelected(new Set())}>Clear</Button></div>}
      {error && <div style={{padding: '0 18px 14px'}}><Notice tone="danger" title="Could not load the list">{error}</Notice></div>}
      <div className="fa-tablewrap">
        <table className="fa-table">
          <thead><tr><th className="is-check"><input type="checkbox" className="fa-check" aria-label="Select all on this page" checked={everything} onChange={event => setSelected(event.target.checked ? new Set(items.map(item => item.id)) : new Set())}/></th><th>Title</th><th>Author</th><th>Category</th><th>Status</th><th>Date</th><th className="is-actions"><span className="fa-sr">Actions</span></th></tr></thead>
          <tbody>
            {!data && !error && [0, 1, 2, 3, 4].map(row => <tr key={row}><td/><td><div className="fa-title-cell"><Skeleton width={52} height={52}/><Skeleton width="60%" height={14}/></div></td><td><Skeleton width={90} height={14}/></td><td><Skeleton width={70} height={14}/></td><td><Skeleton width={70} height={22}/></td><td><Skeleton width={80} height={14}/></td><td/></tr>)}
            {items.map(item => <tr key={item.id} className={selected.has(item.id) ? 'is-selected' : ''}>
              <td className="is-check"><input type="checkbox" className="fa-check" aria-label={`Select ${item.title}`} checked={selected.has(item.id)} onChange={() => toggle(item.id)}/></td>
              <td><div className="fa-title-cell">{item.image ? <img className="fa-thumb" src={item.image} alt="" loading="lazy"/> : <span className="fa-thumb"><FileText aria-hidden="true"/></span>}
                <div className="fa-title-text"><a href={`#/content/${type}/${item.id}`}>{item.title}</a><small>{liveUrl(item)}</small></div></div></td>
              <td>{item.authorName ? <span className="fa-person"><Avatar name={item.authorName} size="sm"/>{item.authorName}</span> : <span className="fa-dash">—</span>}</td>
              <td>{item.category ? <Chip tone="outline">{item.category}</Chip> : <span className="fa-dash">—</span>}</td>
              <td><StatusChip status={item.status}/></td>
              <td><span className="fa-date">{item.status === 'scheduled' ? <>{fmtDate(item.publishedAt)}<small>Scheduled</small></> : item.status === 'published' ? <>{fmtDate(item.publishedAt)}<small>Edited {ago(item.updatedAt)}</small></> : <>Edited {ago(item.updatedAt)}<small>{fmtDate(item.updatedAt)}</small></>}</span></td>
              <td className="is-actions"><Menu label={`Actions for ${item.title}`} trigger={({toggle: open, props}) => <IconButton icon={MoreHorizontal} label="Row actions" onClick={open} {...props}/>}>
                <MenuItem icon={Pencil} href={`#/content/${type}/${item.id}`}>Edit</MenuItem>
                <MenuItem icon={Eye} href={`/api/staff/content/${item.id}/preview`} target="_blank" rel="noreferrer">Preview</MenuItem>
                {item.status === 'published' && <MenuItem icon={ExternalLink} href={liveUrl(item)} target="_blank" rel="noreferrer">View on website</MenuItem>}
                {creator && <><MenuSeparator/><MenuItem icon={Copy} onClick={() => duplicate(item)}>Duplicate</MenuItem></>}</Menu></td>
            </tr>)}
          </tbody>
        </table>
        {data && !items.length && !error && (state.q || state.status
          ? <EmptyState icon={Newspaper} title="No matching items" action={<Button onClick={() => { setQuery(''); setState(s => ({...s, q: '', status: '', page: 1})); }}>Clear filters</Button>}>Nothing matches your search or filter. Try a different word or status.</EmptyState>
          : <EmptyState icon={Newspaper} title={`No ${text.plural.toLowerCase()} yet`} action={creator && <Button variant="primary" icon={Plus} onClick={() => { window.location.hash = `#/content/${type}/new`; }}>Create the first one</Button>}>{text.blurb}</EmptyState>)}
      </div>
      {data && data.total > 0 && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={page => setState(s => ({...s, page}))} onPageSize={size => setState(s => ({...s, size, page: 1}))}/>}
    </Card>
  </div>;
}
