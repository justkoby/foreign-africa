import React, {useEffect, useState} from 'react';
import {allows} from '../../server/permissions.js';

async function api(path, options = {}) {
  const response = await fetch(path, {credentials: 'same-origin', headers: {'Content-Type': 'application/json'}, ...options, body: options.body === undefined ? undefined : JSON.stringify(options.body)});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The request failed.');
  return data;
}

function dateInput(value) {
  const text = String(value || '');
  return text ? text.slice(0, 10) : '';
}

export function ContentList({type, label, user}) {
  const [page, setPage] = useState(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('updated');
  const [current, setCurrent] = useState(1);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [notice, setNotice] = useState('');
  const load = next => api(`/api/staff/content?type=${type}&q=${encodeURIComponent(query)}&status=${status}&sort=${sort}&page=${next}&pageSize=20`).then(data => setPage(data)).catch(reason => setError(reason.message));
  useEffect(() => {setSelected(new Set()); load(current);}, [type, current, status, sort]);
  const publisher = allows(user.roles, 'content.publish');
  const remover = allows(user.roles, 'content.delete');
  const toggle = id => setSelected(previous => {const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next;});
  const allOnPage = Boolean(page?.items.length) && page.items.every(item => selected.has(item.id));
  async function bulk(action) {
    if (action === 'delete' && !window.confirm(`Delete ${selected.size} item${selected.size === 1 ? '' : 's'}? They can no longer be opened.`)) return;
    setError(''); setNotice('');
    try {
      const {results} = await api('/api/staff/content/bulk', {method: 'POST', body: {action, ids: [...selected]}});
      const failed = results.filter(result => !result.ok);
      setNotice(`${results.length - failed.length} updated${failed.length ? `, ${failed.length} not changed: ${[...new Set(failed.map(result => result.error))].join(' ')}` : '.'}`);
      setSelected(new Set()); load(current);
    } catch (reason) {setError(reason.message);}
  }
  return <><div className="studio-bar"><h1>{label}</h1><a className="studio-button" href={`#/content/${type}/new`}>Add new</a></div><form onSubmit={event => {event.preventDefault(); setCurrent(1); load(1);}}><input aria-label={`Search ${label}`} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by title"/><select aria-label="Status" value={status} onChange={event => {setStatus(event.target.value); setCurrent(1);}}><option value="">Any status</option><option value="draft">Draft</option><option value="published">Published</option><option value="scheduled">Scheduled</option><option value="archived">Archived</option></select><select aria-label="Sort" value={sort} onChange={event => setSort(event.target.value)}><option value="updated">Last modified</option><option value="published">Publication date</option><option value="title">Title</option></select><button type="submit">Search</button></form>{error && <p className="studio-alert" role="alert">{error}</p>}{notice && <p className="studio-notice" role="status">{notice}</p>}{selected.size > 0 && <div className="studio-bulk" role="toolbar" aria-label="Bulk actions"><strong>{selected.size} selected</strong>{publisher && <><button type="button" onClick={() => bulk('publish')}>Publish</button><button type="button" onClick={() => bulk('unpublish')}>Move to draft</button><button type="button" onClick={() => bulk('archive')}>Archive</button></>}{remover && <button type="button" className="is-danger" onClick={() => bulk('delete')}>Delete</button>}{!publisher && !remover && <span>Your role cannot change these items in bulk.</span>}<button type="button" onClick={() => setSelected(new Set())}>Clear</button></div>}{page && !page.items.length && <p>No {label.toLowerCase()} yet.</p>}<table><thead><tr><th scope="col"><input type="checkbox" aria-label="Select all on this page" checked={allOnPage} onChange={event => setSelected(event.target.checked ? new Set(page.items.map(item => item.id)) : new Set())}/></th><th scope="col"><span className="studio-sr">Image</span></th><th scope="col">Title</th><th scope="col">Author</th><th scope="col">Status</th><th scope="col">Published</th><th scope="col">Modified</th><th scope="col"><span className="studio-sr">Actions</span></th></tr></thead><tbody>{page?.items.map(item => <tr key={item.id}><td><input type="checkbox" aria-label={`Select ${item.title}`} checked={selected.has(item.id)} onChange={() => toggle(item.id)}/></td><td>{item.image && <img className="studio-thumb" src={item.image} alt=""/>}</td><td><a href={`#/content/${type}/${item.id}`}>{item.title}</a><small>{item.category}</small></td><td>{item.authorName}</td><td>{item.status}</td><td>{dateInput(item.publishedAt)}</td><td>{dateInput(item.updatedAt)}</td><td>{publisher && <button type="button" onClick={async () => {const copy = await api(`/api/staff/content/${item.id}/duplicate`, {method: 'POST', body: {}}); window.location.hash = `#/content/${type}/${copy.item.id}`;}}>Duplicate</button>}</td></tr>)}</tbody></table>{page && page.total > page.pageSize && <div className="studio-actions"><button type="button" disabled={current === 1} onClick={() => setCurrent(value => value - 1)}>Previous</button><span>Page {page.page}</span><button type="button" disabled={current * page.pageSize >= page.total} onClick={() => setCurrent(value => value + 1)}>Next</button></div>}</>;
}

export {default as ContentEditor} from './editor/ContentEditor.jsx';
