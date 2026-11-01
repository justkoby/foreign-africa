import React, {useEffect, useState} from 'react';

async function read(path, options = {}) {
  const response = await fetch(path, {credentials: 'same-origin', ...options});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The request failed.');
  return data;
}

export function MediaPicker({accept = 'all', onSelect, onClose}) {
  return <div className="studio-canvas" role="dialog" aria-label="Media library"><MediaLibrary accept={accept} onSelect={onSelect}/><button type="button" onClick={onClose}>Close</button></div>;
}

export default function MediaLibrary({accept = 'all', onSelect}) {
  const [files, setFiles] = useState(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = () => read(`/api/staff/media?q=${encodeURIComponent(query)}`).then(data => setFiles(data.files)).catch(reason => setError(reason.message));
  useEffect(() => {load();}, []);
  const visible = (files || []).filter(file => accept === 'all' || (accept === 'pdf' ? file.mime === 'application/pdf' : file.mime.startsWith('image/')));
  return <><div className="studio-bar"><h1>Media library</h1></div><form onSubmit={event => {event.preventDefault(); load();}}><input aria-label="Search media" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by file name or alt text"/><button type="submit">Search</button></form><form onSubmit={async event => {event.preventDefault(); setError(''); setNotice(''); const body = new FormData(event.currentTarget); try {await fetch('/api/staff/media', {method: 'POST', body, credentials: 'same-origin'}).then(async response => {const data = await response.json(); if (!response.ok) throw new Error(data.error || 'The upload failed.');}); event.currentTarget.reset(); setNotice('Uploaded.'); load();} catch (reason) {setError(reason.message);}}}><label>Upload a JPEG, PNG, WebP, GIF, or PDF<input name="file" type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" required/></label><button type="submit">Upload</button></form>{error && <p className="studio-alert" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}{files && !visible.length && <p>No files yet.</p>}<div className="studio-library">{visible.map(file => <article key={file.id}><img src={file.thumb || file.url} alt=""/>{file.mime === 'application/pdf' && <strong>PDF</strong>}<p>{file.name}</p><p>{file.width && file.height ? `${file.width}×${file.height} · ` : ''}{Math.ceil(file.bytes / 1024)} KB</p><label>Alt text<input defaultValue={file.alt} onBlur={async event => {if (event.target.value !== file.alt) {await read(`/api/staff/media/${file.id}`, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({alt: event.target.value})}); load();}}}/></label><button type="button" onClick={async () => {await navigator.clipboard.writeText(new URL(file.url, window.location.origin).toString()); setNotice('Public URL copied.');}}>Copy URL</button>{onSelect && <button type="button" onClick={() => onSelect(file)}>Select</button>}<button type="button" onClick={async () => {if (!window.confirm('Delete this file?')) return; try {await read(`/api/staff/media/${file.id}`, {method: 'DELETE'}); load();} catch (reason) {setError(reason.message);}}}>Delete</button></article>)}</div></>;
}
