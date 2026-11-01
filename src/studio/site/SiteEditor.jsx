import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ExternalLink, History, Monitor, RefreshCw, Smartphone} from 'lucide-react';
import {homepageSections} from '../../../server/site-fields.js';
import {MediaPicker} from '../MediaLibrary.jsx';
import {setUnsaved} from '../unsaved.js';
import {Field} from './Fields.jsx';
import HeroEditor from './HeroEditor.jsx';
import './site.css';

async function rawApi(path, options) {
  const response = await fetch(path, {credentials: 'same-origin', headers: {'Content-Type': 'application/json'}, ...options, body: options?.body === undefined ? undefined : JSON.stringify(options.body)});
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { const failure = new Error(body.error || 'The request failed.'); failure.problems = body.problems; failure.status = response.status; throw failure; }
  return body;
}
const when = value => (value ? new Date(value).toLocaleString('en-GB', {dateStyle: 'medium', timeStyle: 'short'}) : '');
const titles = {hero: 'Hero slider', homepage: 'Homepage sections'};

function Preview({device, nonce}) {
  const box = useRef(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    if (!box.current) return undefined;
    const watch = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    watch.observe(box.current);
    return () => watch.disconnect();
  }, []);
  const design = device === 'mobile' ? {w: 390, h: 800} : {w: 1440, h: 900};
  const scale = Math.min(1, (width - 2) / design.w);
  return <div className="se-preview-box" ref={box}>
    <div className={`se-device is-${device}`} style={{width: design.w * scale, height: design.h * scale}}>
      <iframe key={`${device}-${nonce}`} title={`${device} preview of the draft`} src={`/api/staff/site/preview?n=${nonce}`} style={{width: design.w, height: design.h, transform: `scale(${scale})`}}/>
    </div></div>;
}

export default function SiteEditor({area, user}) {
  const [data, setData] = useState(null);
  const [doc, setDoc] = useState(null);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [device, setDevice] = useState('desktop');
  const [nonce, setNonce] = useState(1);
  const [tab, setTab] = useState('edit');
  const [picker, setPicker] = useState(null);
  const [revisions, setRevisions] = useState(null);

  const load = useCallback(() => rawApi(`/api/staff/site/${area}`).then(next => {setData(next); setDoc(next.document); setDirty(false); setErrors({}); setError(''); setNonce(value => value + 1);}).catch(reason => setError(reason.message)), [area]);
  useEffect(() => {setData(null); setRevisions(null); setNotice(''); load();}, [load]);
  useEffect(() => {setUnsaved(dirty); return () => setUnsaved(false);}, [dirty]);
  useEffect(() => {const warn = event => {if (dirty) event.preventDefault();}; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);}, [dirty]);

  const show = problems => { const map = {}; for (const item of problems ?? []) (map[item.path] ??= []).push(item.message); setErrors(map); };
  async function run(task, done) {
    setBusy(true); setError(''); setNotice('');
    try { await task(); if (done) setNotice(done); return true; }
    catch (reason) { setError(reason.message); if (reason.problems) show(reason.problems); return false; }
    finally { setBusy(false); }
  }
  // The shared api() helper drops the per-field problems a 400 carries, which this editor needs, so it uses fetch directly.
  const save = () => run(async () => {
    const result = await rawApi(`/api/staff/site/${area}`, {method: 'PUT', body: {document: doc, baseVersion: data.state.version}});
    setData(current => ({...current, state: result.state})); setDirty(false); setErrors({}); setNonce(value => value + 1);
  }, 'Draft saved. The live website has not changed.');

  const publish = () => {
    if (!window.confirm(`Publish the ${titles[area].toLowerCase()} to the live website now?`)) return Promise.resolve();
    return run(async () => {
      const result = await rawApi(`/api/staff/site/${area}/publish`, {method: 'POST', body: {baseVersion: data.state.version}});
      setData(current => ({...current, state: result.state, published: doc}));
    }, 'Published. The live website now shows these changes.');
  };
  const discard = () => {
    if (!window.confirm('Throw away all unpublished changes and go back to the live version?')) return Promise.resolve();
    return run(async () => { await rawApi(`/api/staff/site/${area}/discard`, {method: 'POST', body: {}}); await load(); }, 'Draft reset to the live version.');
  };
  const openRevisions = () => run(async () => { setRevisions((await rawApi(`/api/staff/site/${area}/revisions`)).revisions); });
  const restore = revision => {
    if (dirty && !window.confirm('Restoring replaces your unsaved edits in the draft. Continue?')) return Promise.resolve();
    return run(async () => { await rawApi(`/api/staff/site/${area}/restore`, {method: 'POST', body: {revisionId: revision.id, baseVersion: data.state.version}}); await load(); setRevisions(null); }, 'Earlier version restored to the draft. It is not live until you publish.');
  };

  if (error && !data) return <p className="studio-alert" role="alert">{error}</p>;
  if (!data || !doc) return <p>Loading…</p>;
  const state = data.state;
  const ctx = {errors, options: data.options, disabled: busy, pick: (accept, onSelect) => setPicker({accept, onSelect})};
  const live = state.hasPublished ? `Live version published ${when(state.publishedAt)}${state.publishedBy ? ` by ${state.publishedBy}` : ''}.` : 'The live website is using the original built-in content.';
  const draftText = dirty ? 'You have unsaved edits.' : state.hasUnpublishedChanges ? `Saved draft has changes that are not live yet${state.draftSavedBy ? ` (saved ${when(state.draftSavedAt)} by ${state.draftSavedBy})` : ''}.` : 'The draft matches the live website.';
  const draftClass = dirty ? 'is-dirty' : state.hasUnpublishedChanges ? 'is-pending' : 'is-clean';

  return <div className="se">
    <div className="studio-bar"><h1>{titles[area]}</h1></div>
    <div className={`se-status ${draftClass}`} role="status"><p><strong>Draft:</strong> {draftText}</p><p><strong>Live:</strong> {live}</p></div>
    {error && <p className="studio-alert" role="alert">{error}{error.includes('Someone else') && <> <button type="button" onClick={load}>Reload their version</button></>}</p>}
    {notice && <p className="studio-notice" role="status">{notice}</p>}
    <div className="se-actions">
      <button type="button" className={dirty ? 'is-primary' : ''} disabled={busy || !dirty} onClick={save}>Save draft</button>
      {data.canPublish
        ? <button type="button" className="is-primary" disabled={busy || dirty || !state.hasUnpublishedChanges} title={dirty ? 'Save your draft first' : !state.hasUnpublishedChanges ? 'There is nothing new to publish' : ''} onClick={publish}>Publish to the live site</button>
        : <span className="sf-hint">Only administrators can publish. Save your draft, then ask an administrator to review and publish it.</span>}
      {state.hasUnpublishedChanges && !dirty && <button type="button" disabled={busy} onClick={discard}>Discard draft changes</button>}
      <button type="button" disabled={busy} onClick={openRevisions}><History size={15} aria-hidden="true"/> Earlier versions</button>
    </div>
    {revisions && <div className="studio-panel se-revisions" role="group" aria-label="Earlier versions"><h2>Earlier versions</h2>{revisions.length ? <ul>{revisions.map(revision => <li key={revision.id}><span>{when(revision.createdAt)} · {revision.kind === 'published' ? 'Published' : 'Draft save'}{revision.author ? ` by ${revision.author}` : ''}</span><button type="button" disabled={busy} onClick={() => restore(revision)}>Restore to draft</button></li>)}</ul> : <p className="studio-empty">No earlier versions yet.</p>}<button type="button" onClick={() => setRevisions(null)}>Close</button><p className="sf-hint">Restoring only changes the draft. Nothing goes live until you publish.</p></div>}

    <div className="se-tabs" role="tablist" aria-label="View"><button type="button" role="tab" aria-selected={tab === 'edit'} aria-pressed={tab === 'edit'} onClick={() => setTab('edit')}>Edit</button><button type="button" role="tab" aria-selected={tab === 'preview'} aria-pressed={tab === 'preview'} onClick={() => setTab('preview')}>Preview</button></div>
    <div className={`se-grid is-${tab}`}>
      <section className="se-form" aria-label="Edit content">
        {area === 'hero'
          ? <HeroEditor doc={doc} ctx={ctx} setDoc={next => {setDoc(next); setDirty(true);}}/>
          : homepageSections.map(section => {
            const bad = Object.keys(errors).filter(key => key.startsWith(`${section.key}.`)).length;
            return <details className="se-section" key={section.key} open={bad > 0}><summary>{section.label}{bad > 0 && <span className="se-bad">{bad} problem{bad === 1 ? '' : 's'}</span>}</summary><div>{Object.entries(section.fields).map(([key, descriptor]) => <Field key={key} descriptor={descriptor} value={doc[section.key]?.[key]} path={`${section.key}.${key}`} ctx={ctx} onChange={next => {setDoc({...doc, [section.key]: {...doc[section.key], [key]: next}}); setDirty(true);}}/>)}</div></details>;
          })}
        {data.canManage && <label className="se-permission"><input type="checkbox" checked={Boolean(data.settings.editorsCanPublish)} disabled={busy} onChange={event => run(async () => { const result = await rawApi('/api/staff/site/settings', {method: 'PUT', body: {editorsCanPublish: event.target.checked}}); setData(current => ({...current, settings: result.settings})); }, 'Publishing permission updated.')}/> Allow editors to publish the homepage and hero (otherwise only administrators can).</label>}
      </section>
      <section className="se-preview" aria-label="Preview of the saved draft">
        <div className="se-preview-bar"><div className="ml-views" role="group" aria-label="Preview size"><button type="button" aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}><Monitor size={15}/> Desktop</button><button type="button" aria-pressed={device === 'mobile'} onClick={() => setDevice('mobile')}><Smartphone size={15}/> Mobile</button></div>
          <button type="button" onClick={() => setNonce(value => value + 1)}><RefreshCw size={14} aria-hidden="true"/> Refresh</button><a href={`/api/staff/site/preview?n=${nonce}`} target="_blank" rel="noreferrer"><ExternalLink size={14} aria-hidden="true"/> Open in a new tab</a></div>
        <p className="sf-hint">{dirty ? 'The preview shows your last saved draft. Save the draft to see your latest edits.' : 'This is the real website with your saved draft. Visitors see it only after you publish.'}</p>
        <Preview device={device} nonce={nonce}/>
      </section>
    </div>
    {picker && <MediaPicker accept={picker.accept} user={user} onClose={() => setPicker(null)} onSelect={file => {picker.onSelect(file); setPicker(null);}}/>}
  </div>;
}
