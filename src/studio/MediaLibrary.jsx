import React, {useCallback, useEffect, useRef, useState} from 'react';
import {FileText, LayoutGrid, List as ListIcon, Search, Upload, X} from 'lucide-react';
import {allows} from '../../server/permissions.js';
import {api} from './api.js';
import {Button, IconButton, useFeedback} from './ui/index.jsx';
import './media.css';

// A size that is missing or zero is reported as unavailable instead of an incorrect "0 KB".
const kb = bytes => (!(Number(bytes) > 0) ? 'Size unavailable' : bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : bytes < 1024 ? `${bytes} B` : `${Math.ceil(bytes / 1024)} KB`);
const typeLabel = file => (file.kind === 'document' ? 'PDF' : (/^image\/(?!octet)/.test(file.mime || '') ? file.mime.replace('image/', '') : String(file.name).split('.').pop()).toUpperCase());
const day = value => (value ? new Date(value).toLocaleDateString('en-GB', {dateStyle: 'medium'}) : '');
const typeOf = accept => (accept === 'pdf' ? 'document' : accept === 'image' ? 'image' : '');

export function MediaPicker({accept = 'image', user, onSelect, onClose}) {
  useEffect(() => {
    const close = event => {if (event.key === 'Escape') onClose();};
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  return <div className="ml-overlay" role="dialog" aria-modal="true" aria-label="Media library">
    <div className="ml-modal"><IconButton className="ml-close" icon={X} label="Close media library" onClick={onClose}/><MediaLibrary mode="picker" accept={accept} user={user} onSelect={onSelect}/></div>
  </div>;
}

export default function MediaLibrary({mode = 'page', accept = 'all', user, onSelect}) {
  const [data, setData] = useState(null);
  const [query, setQuery] = useState('');
  const [type, setType] = useState(typeOf(accept));
  const [sort, setSort] = useState('newest');
  const [view, setView] = useState(() => {try {return localStorage.getItem('fa-media-view') || 'grid';} catch {return 'grid';}});
  const [page, setPage] = useState(1);
  const [current, setCurrent] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploads, setUploads] = useState([]);
  const [dragging, setDragging] = useState(false);
  const input = useRef(null);
  const canEditAny = user ? allows(user.roles, 'content.update.any') : false;
  const locked = Boolean(typeOf(accept));

  const load = useCallback(() => api(`/api/staff/media?q=${encodeURIComponent(query)}&type=${type}&sort=${sort}&page=${page}&pageSize=24`).then(setData).catch(reason => setError(reason.message)), [query, type, sort, page]);
  useEffect(() => {load();}, [load]);
  useEffect(() => {try {localStorage.setItem('fa-media-view', view);} catch { /* optional */ }}, [view]);

  async function send(files) {
    setError(''); setNotice('');
    const list = [...files];
    setUploads(list.map(file => ({name: file.name, state: 'waiting'})));
    let done = 0;
    for (const [index, file] of list.entries()) {
      setUploads(rows => rows.map((row, at) => at === index ? {...row, state: 'uploading'} : row));
      const body = new FormData(); body.append('file', file);
      try {await api('/api/staff/media', {method: 'POST', body}); done += 1; setUploads(rows => rows.map((row, at) => at === index ? {...row, state: 'done'} : row));}
      catch (reason) {setUploads(rows => rows.map((row, at) => at === index ? {...row, state: 'failed', message: reason.message} : row));}
    }
    if (done) {setNotice(`${done} file${done === 1 ? '' : 's'} uploaded.`); setPage(1); setSort('newest'); load();}
    if (input.current) input.current.value = '';
  }

  const files = data?.files ?? [];
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return <section className={`ml ${mode === 'picker' ? 'is-picker' : ''}`} onDragOver={event => {event.preventDefault(); setDragging(true);}} onDragLeave={event => {if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);}} onDrop={event => {event.preventDefault(); setDragging(false); if (event.dataTransfer.files.length) send(event.dataTransfer.files);}}>
    <div className="ml-top"><div><h1>{mode === 'picker' ? (accept === 'pdf' ? 'Choose a document' : 'Choose an image') : 'Media library'}</h1>{mode !== 'picker' && <p>Images and documents used across the website.</p>}</div>
      <div className="ml-actions"><Button variant="primary" icon={Upload} onClick={() => input.current?.click()}>Add files</Button>
        <input ref={input} type="file" multiple hidden accept={accept === 'pdf' ? 'application/pdf' : accept === 'image' ? 'image/jpeg,image/png,image/webp,image/gif' : 'image/jpeg,image/png,image/webp,image/gif,application/pdf'} onChange={event => event.target.files.length && send(event.target.files)}/></div></div>
    <div className="ml-filters">
      <form role="search" onSubmit={event => {event.preventDefault(); setPage(1); load();}}><label className="fa-sr" htmlFor="ml-search">Search media</label><div className="ml-search"><Search size={16} aria-hidden="true"/><input id="ml-search" value={query} onChange={event => {setQuery(event.target.value); setPage(1);}} placeholder="Search name, title, alt text or caption"/></div></form>
      {!locked && <label>Type<select value={type} onChange={event => {setType(event.target.value); setPage(1);}}><option value="">All files</option><option value="image">Images</option><option value="document">Documents</option></select></label>}
      <label>Sort<select value={sort} onChange={event => {setSort(event.target.value); setPage(1);}}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">File name</option></select></label>
      <div className="ml-views" role="group" aria-label="View"><button type="button" aria-pressed={view === 'grid'} aria-label="Grid view" onClick={() => setView('grid')}><LayoutGrid size={16}/></button><button type="button" aria-pressed={view === 'list'} aria-label="List view" onClick={() => setView('list')}><ListIcon size={16}/></button></div>
    </div>
    {dragging && <div className="ml-drop" aria-hidden="true">Drop files to upload</div>}
    {error && <p className="fa-notice is-danger" role="alert">{error}</p>}{notice && <p className="fa-notice is-success" role="status">{notice}</p>}
    {uploads.some(row => row.state !== 'done') && <ul className="ml-uploads" aria-live="polite">{uploads.map((row, index) => <li key={index} className={`is-${row.state}`}>{row.name}: {row.state === 'failed' ? row.message : row.state}</li>)}</ul>}
    <div className="ml-body">
      <div className="ml-results">
        {data && !files.length && <p className="ml-empty">{query || type ? 'No files match.' : 'No files yet. Drag files here or choose Add files.'}</p>}
        {view === 'grid'
          ? <ul className="ml-grid">{files.map(file => <li key={file.id}><button type="button" className="ml-tile" aria-pressed={current?.id === file.id} onClick={() => setCurrent(file)}>{file.kind === 'document' ? <span className="ml-doc"><FileText size={32} aria-hidden="true"/>PDF</span> : <img src={file.thumb || file.url} alt={file.alt || ''} loading="lazy"/>}<span className="ml-cap"><span className="ml-name" title={file.name}>{file.name}</span><span className="ml-sub">{typeLabel(file)} · {kb(file.bytes)}</span></span></button></li>)}</ul>
          : <div className="ml-listcard"><table className="ml-list"><thead><tr><th scope="col"><span className="fa-sr">Preview</span></th><th scope="col">File</th><th scope="col">Type</th><th scope="col">Size</th><th scope="col">Uploaded</th></tr></thead><tbody>{files.map(file => <tr key={file.id} aria-selected={current?.id === file.id}><td>{file.kind === 'document' ? <span className="ml-fileicon"><FileText size={20} aria-hidden="true"/></span> : <img className="ml-mini" src={file.thumb || file.url} alt=""/>}</td><td><button type="button" className="ml-link" title={file.name} onClick={() => setCurrent(file)}>{file.name}</button>{!file.alt && file.kind === 'image' && <small className="ml-warn"> · missing alt text</small>}</td><td>{typeLabel(file)}</td><td>{kb(file.bytes)}</td><td>{day(file.createdAt)}</td></tr>)}</tbody></table></div>}
        {data && pages > 1 && <div className="ml-pager"><Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page} of {pages} · {data.total} files</span><Button size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button></div>}
      </div>
      {current && <MediaDetails key={current.id} file={current} mode={mode} canEditAny={canEditAny} user={user} onSelect={onSelect} onChanged={updated => {setCurrent(updated); load();}} onRemoved={() => {setCurrent(null); load();}} onClose={() => setCurrent(null)}/>}
    </div>
  </section>;
}

function MediaDetails({file, mode, canEditAny, user, onSelect, onChanged, onRemoved, onClose}) {
  const [form, setForm] = useState({title: file.title, alt: file.alt, caption: file.caption});
  const [usage, setUsage] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const replace = useRef(null);
  const {confirm} = useFeedback();
  const mine = user && Number(file.createdBy) === Number(user.id);
  const editable = canEditAny || mine;
  useEffect(() => {api(`/api/staff/media/${file.id}`).then(data => setUsage(data.usage)).catch(() => setUsage([]));}, [file.id, file.version]);
  const change = key => event => setForm({...form, [key]: event.target.value});
  async function save() {
    setError(''); setMessage('');
    try {const {asset} = await api(`/api/staff/media/${file.id}`, {method: 'PATCH', body: form}); setMessage('Saved.'); onChanged(asset); return asset;} catch (reason) {setError(reason.message); return null;}
  }
  async function swap(files) {
    setError(''); setMessage('');
    const body = new FormData(); body.append('file', files[0]);
    try {const {asset} = await api(`/api/staff/media/${file.id}/replace`, {method: 'POST', body}); setMessage('File replaced. Every page that uses it now shows the new file.'); onChanged(asset);} catch (reason) {setError(reason.message);}
  }
  async function remove() {
    if (!await confirm({title: 'Delete this file?', message: 'It will be removed permanently. This cannot be undone.', confirm: 'Delete file', danger: true})) return;
    setError('');
    try {await api(`/api/staff/media/${file.id}`, {method: 'DELETE'}); onRemoved();} catch (reason) {setError(reason.message);}
  }
  const dirty = form.title !== file.title || form.alt !== file.alt || form.caption !== file.caption;
  return <aside className="ml-details" aria-label="File details">
    <div className="ml-details-head"><h2>File details</h2><IconButton icon={X} label="Close details" onClick={onClose}/></div>
    <div className="ml-preview">{file.kind === 'document' ? <a href={file.url} target="_blank" rel="noreferrer"><FileText size={40} aria-hidden="true"/> Open PDF</a> : <img src={file.url} alt={file.alt || ''}/>}</div>
    <dl className="ml-meta"><dt>File name</dt><dd>{file.name}</dd><dt>Type</dt><dd>{typeLabel(file)}</dd>{file.width && <><dt>Dimensions</dt><dd>{file.width} × {file.height} px</dd></>}<dt>Size</dt><dd>{kb(file.bytes)}</dd><dt>Uploaded</dt><dd>{day(file.createdAt)}</dd><dt>Address</dt><dd><code>{file.url}</code></dd></dl>
    {error && <p className="fa-notice is-danger" role="alert">{error}</p>}{message && <p className="fa-notice is-success" role="status">{message}</p>}
    {file.kind === 'image' && <label>Alt text<textarea rows={2} maxLength={300} value={form.alt} disabled={!editable} onChange={change('alt')} placeholder="Describe the image for people who cannot see it"/></label>}
    <label>Title<input value={form.title} maxLength={200} disabled={!editable} onChange={change('title')}/></label>
    <label>Caption<textarea rows={2} maxLength={500} value={form.caption} disabled={!editable} onChange={change('caption')}/></label>
    <div className="ml-btns">
      {editable && <Button size="sm" variant="soft" disabled={!dirty} onClick={save}>Save details</Button>}
      {onSelect && <Button size="sm" variant="primary" onClick={async () => {const saved = dirty && editable ? await save() : file; if (saved) onSelect(saved);}}>{mode === 'picker' ? 'Use this file' : 'Select'}</Button>}
      <Button size="sm" onClick={async () => {await navigator.clipboard?.writeText(new URL(file.url, window.location.origin).toString()); setMessage('Address copied.');}}>Copy address</Button>
    </div>
    <h3>Where it is used</h3>
    {usage === null ? <p className="fa-muted">Checking…</p> : usage.length ? <ul className="ml-usage">{usage.map(use => <li key={`${use.kind}-${use.id}`}><a href={use.kind === 'site' ? `#/site/${use.id}` : `#/content/${use.type}/${use.id}`}>{use.title}</a> <small>{use.as.join(', ')} · {use.status}</small></li>)}</ul> : <p className="fa-muted">Not used by any page yet.</p>}
    {canEditAny && !file.builtIn && <div className="ml-danger"><input ref={replace} type="file" hidden accept={file.kind === 'document' ? 'application/pdf' : 'image/jpeg,image/png,image/webp,image/gif'} onChange={event => event.target.files.length && swap(event.target.files)}/><Button size="sm" onClick={() => replace.current?.click()}>Replace file</Button><Button size="sm" variant="danger" disabled={Boolean(usage?.length)} title={usage?.length ? 'Remove it from the pages above first' : ''} onClick={remove}>Delete</Button></div>}
    {file.builtIn && <p className="fa-muted">This is a built-in site image. It can be chosen but not replaced or deleted here.</p>}
  </aside>;
}
