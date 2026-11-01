import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useEditor, EditorContent} from '@tiptap/react';
import {ArrowLeft, CalendarClock, Eye, History, PanelRightClose, PanelRightOpen, Search, SlidersHorizontal, X} from 'lucide-react';
import {allows} from '../../../server/permissions.js';
import {api} from '../api.js';
import {MediaPicker} from '../MediaLibrary.jsx';
import {setUnsaved} from '../unsaved.js';
import {Button, StatusChip, Switch, Tabs, Notice, Skeleton, useFeedback} from '../ui/index.jsx';
import {documentFacts, editorExtensions, insertBlock} from './extensions.js';
import Toolbar from './Toolbar.jsx';
import './editor.css';

const statusLabel = {draft: 'Draft', scheduled: 'Scheduled', published: 'Published', archived: 'Archived', in_review: 'In review', changes_requested: 'Changes requested', approved: 'Approved', rejected: 'Rejected'};
const blank = user => ({title: '', slug: '', summary: '', document: {type: 'doc', content: []}, seoTitle: '', seoDescription: '', status: 'draft', authorName: user.name, category: '', tags: [], featured: false, location: '', imageFit: 'cover'});
const dateInput = value => (value ? String(value).slice(0, 10) : '');
const publicPath = item => (item.type === 'news' ? `/news/${item.slug}/` : `/${item.slug}/`);
const localInput = date => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const time = value => (value ? new Date(value).toLocaleString('en-GB', {dateStyle: 'medium', timeStyle: 'short'}) : '');

export default function ContentEditor({type, id, user}) {
  const [item, setItem] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    if (id === 'new') {setItem({...blank(user), type}); return undefined;}
    api(`/api/staff/content/${id}`).then(data => live && setItem(data.item)).catch(reason => live && setError(reason.message));
    return () => {live = false;};
  }, [id, type, user]);
  if (error) return <div className="fa-page"><Notice tone="danger" title="This item could not be opened">{error}</Notice></div>;
  if (!item) return <div className="ed-loading" aria-busy="true"><Skeleton width="60%" height={38}/><Skeleton height={320}/></div>;
  return <Editing key={item.id ?? 'new'} type={type} initial={item} user={user}/>;
}

function Panel({title, children, open = true, hint}) {
  return <details className="ed-panel" open={open}><summary>{title}{hint && <small>{hint}</small>}</summary><div>{children}</div></details>;
}
const panelPref = () => {try {return window.localStorage.getItem('fa-editor-panel') !== 'closed';} catch {return true;}};

function Editing({type, initial, user}) {
  const [item, setItem] = useState(initial);
  const [edits, setEdits] = useState(0);
  const [state, setState] = useState('');
  const [error, setError] = useState('');
  const [picker, setPicker] = useState('');
  const [revisions, setRevisions] = useState([]);
  const [compare, setCompare] = useState(null);
  const [terms, setTerms] = useState({category: [], tag: []});
  const [scheduleAt, setScheduleAt] = useState(initial.status === 'scheduled' && initial.publishedAt ? localInput(new Date(initial.publishedAt)) : '');
  const [slugOpen, setSlugOpen] = useState(false);
  const [tab, setTab] = useState('document');
  const [panelOpen, setPanelOpen] = useState(panelPref);
  const {confirm} = useFeedback();
  const togglePanel = () => setPanelOpen(open => {try {window.localStorage.setItem('fa-editor-panel', open ? 'closed' : 'open');} catch {/* preference only */} return !open;});
  const itemRef = useRef(item);
  itemRef.current = item;
  const dirty = edits > 0;
  const publisher = allows(user.roles, 'content.publish');
  const remover = allows(user.roles, 'content.delete');
  const manager = allows(user.roles, 'content.update.any');

  const editor = useEditor({extensions: editorExtensions(), content: initial.document || {type: 'doc', content: []}, onUpdate: () => setEdits(count => count + 1)});
  const touch = patch => {setItem(current => ({...current, ...patch})); setEdits(count => count + 1);};
  const loadRevisions = useCallback(id => id && api(`/api/staff/content/${id}/revisions`).then(data => setRevisions(data.revisions)).catch(() => {}), []);
  useEffect(() => {loadRevisions(initial.id);}, [initial.id, loadRevisions]);
  useEffect(() => {Promise.all([api('/api/staff/terms?vocabulary=category'), api('/api/staff/terms?vocabulary=tag')]).then(([c, t]) => setTerms({category: c.terms, tag: t.terms})).catch(() => {});}, []);
  useEffect(() => {setUnsaved(dirty); return () => setUnsaved(false);}, [dirty]);
  useEffect(() => {const warn = event => {if (dirty) event.preventDefault();}; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);}, [dirty]);

  const facts = useMemo(() => documentFacts(editor?.getJSON()), [editor, edits]);
  const payload = () => {
    const current = itemRef.current;
    return {type, title: current.title, slug: current.slug, summary: current.summary, document: editor.getJSON(), seoTitle: current.seoTitle, seoDescription: current.seoDescription, authorName: current.authorName, category: current.category, tags: current.tags, featured: current.featured, featuredMediaId: current.featuredMediaId ?? null, socialImageId: current.socialImageId ?? null, location: current.location, imageFit: current.imageFit, publishedAt: current.status === 'scheduled' ? undefined : current.publishedOn || undefined};
  };
  const save = useCallback(async (status, publishedAt) => {
    setError(''); setState('Saving…');
    try {
      const current = itemRef.current;
      const body = payload();
      const data = current.id ? await api(`/api/staff/content/${current.id}`, {method: 'PATCH', body}) : await api('/api/staff/content', {method: 'POST', body});
      let next = data.item;
      if (status && status !== next.status) next = (await api(`/api/staff/content/${next.id}/state`, {method: 'POST', body: {status, publishedAt: publishedAt ?? current.publishedOn ?? undefined}})).item;
      setItem({...next, publishedOn: dateInput(next.publishedAt)});
      setEdits(0); setUnsaved(false);
      setState(status === 'published' ? 'Published.' : status === 'scheduled' ? 'Scheduled.' : `Saved at ${new Date().toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'})}.`);
      if (!current.id) window.location.hash = `#/content/${type}/${next.id}`;
      else loadRevisions(next.id);
      return next;
    } catch (reason) {setError(reason.message); setState(''); return null;}
  }, [editor, type, loadRevisions]);

  // Autosave drafts a few seconds after typing stops. Published items are never changed behind the author's back.
  useEffect(() => {
    if (!dirty || !item.id || item.status !== 'draft') return undefined;
    const timer = setTimeout(() => save(), 5000);
    return () => clearTimeout(timer);
  }, [edits, item.id, item.status, dirty, save]);
  useEffect(() => {
    const onKey = event => {if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {event.preventDefault(); save();}};
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  if (!editor) return <div className="ed-loading" aria-busy="true"><Skeleton height={320}/></div>;
  const problems = [];
  const warnings = [];
  if (!item.title.trim()) problems.push('Add a title.');
  if (editor.isEmpty) problems.push('Write some content.');
  if (!item.summary.trim()) warnings.push('No excerpt. Cards and search results will have no summary.');
  if (!item.seoDescription.trim()) warnings.push('No meta description. Search engines will pick their own.');
  if ((item.seoDescription || '').length > 160) warnings.push('The meta description is longer than 160 characters and may be cut off.');
  if ((item.seoTitle || item.title).length > 60) warnings.push('The SEO title is longer than 60 characters and may be cut off.');
  if (!item.featuredMediaId && type !== 'page') warnings.push('No featured image.');
  if (facts.imagesWithoutAlt) warnings.push(`${facts.imagesWithoutAlt} image${facts.imagesWithoutAlt === 1 ? ' has' : 's have'} no alt text.`);
  const slugPath = publicPath({...item, type});
  const when = item.status === 'scheduled' ? item.publishedAt : null;

  async function preview() {
    const tab = window.open('', '_blank');
    if (dirty && item.status === 'draft') await save();
    else if (dirty) setError('Preview shows the last saved version. Choose Update to include your latest edits.');
    if (tab) tab.location.href = `/api/staff/content/${itemRef.current.id}/preview`;
  }
  async function schedule() {
    const at = new Date(scheduleAt);
    if (!scheduleAt || Number.isNaN(at.getTime()) || at.getTime() <= Date.now() + 30000) {setError('Choose a date and time in the future.'); return;}
    await save('scheduled', at.toISOString());
  }
  const addTag = raw => {
    const name = raw.replace(/\s+/g, ' ').trim().slice(0, 160);
    if (!name || item.tags.some(tag => tag.toLowerCase() === name.toLowerCase())) return;
    touch({tags: [...item.tags, name]});
  };
  const categoryNames = [...new Set([...terms.category.map(term => term.name), ...(item.category ? [item.category] : [])])];

  return <div className="ed">
    <header className="ed-top">
      <a className="ed-back" href={`#/content/${type}`} aria-label={`Back to ${type === 'commentary' ? 'commentaries' : type === 'news' ? 'news' : `${type}s`}`}><ArrowLeft size={16} aria-hidden="true"/><span>{type === 'commentary' ? 'Commentaries' : type === 'news' ? 'News' : `${type[0].toUpperCase()}${type.slice(1)}s`}</span></a>
      <span className="ed-sep" aria-hidden="true"/>
      <div className="ed-ctx"><strong title={item.title || 'Untitled'}>{item.title || 'Untitled'}</strong><span className="ed-state" role="status" aria-live="polite">{error ? '' : state || (dirty ? (item.status === 'draft' && item.id ? 'Unsaved changes. Autosaving shortly.' : 'Unsaved changes.') : item.id ? `Last saved ${time(item.updatedAt)}` : 'Not saved yet.')}</span></div>
      <StatusChip status={item.status}/>
      <div className="ed-top-actions">
        {item.id && <Button size="sm" icon={Eye} onClick={preview}>Preview</Button>}
        <Button size="sm" variant="soft" onClick={() => save()} disabled={!dirty && Boolean(item.id)}>{!item.id || item.status === 'draft' ? 'Save draft' : 'Update'}</Button>
        {publisher && item.status !== 'published' && item.status !== 'scheduled' && <Button size="sm" variant="primary" disabled={problems.length > 0} title={problems[0] || ''} onClick={() => save('published')}>Publish</Button>}
        <button type="button" className="fa-iconbtn" aria-label={panelOpen ? 'Hide settings panel' : 'Show settings panel'} aria-expanded={panelOpen} onClick={togglePanel}>{panelOpen ? <PanelRightClose size={18}/> : <PanelRightOpen size={18}/>}</button>
      </div>
    </header>
    {error && <div className="ed-alert"><Notice tone="danger">{error}</Notice></div>}
    <div className={`ed-layout${panelOpen ? '' : ' is-wide'}`}>
      <div className="ed-main">
        <label className="fa-sr" htmlFor="ed-title">Title</label>
        <textarea id="ed-title" className="ed-title" rows={1} value={item.title} placeholder="Add title" onChange={event => {touch({title: event.target.value}); event.target.style.height = 'auto'; event.target.style.height = `${event.target.scrollHeight}px`;}}/>
        <p className="ed-permalink">Permalink: <code>{slugPath}</code> {slugOpen ? <span><input aria-label="Slug" value={item.slug} onChange={event => touch({slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-')})} placeholder="leave blank to use the title"/> <button type="button" onClick={() => setSlugOpen(false)}>Done</button></span> : <button type="button" className="ed-linkish" onClick={() => setSlugOpen(true)}>Edit</button>}</p>
        <Toolbar editor={editor} onPickImage={() => setPicker('image')} onPickDocument={() => setPicker('pdf')}/>
        <div className="ed-canvas"><EditorContent editor={editor}/></div>
        <p className="ed-foot">{facts.words.toLocaleString('en-GB')} words · about {Math.max(1, Math.ceil(facts.words / 220))} min read{facts.tables ? ` · ${facts.tables} table${facts.tables === 1 ? '' : 's'}` : ''}{facts.videos ? ` · ${facts.videos} video${facts.videos === 1 ? '' : 's'}` : ''}</p>
      </div>
      <aside className="ed-side" aria-label="Document settings" hidden={!panelOpen}>
        <Tabs label="Settings" value={tab} onChange={setTab} tabs={[{id: 'document', label: 'Document', icon: SlidersHorizontal}, {id: 'seo', label: 'SEO', icon: Search}, ...(item.id ? [{id: 'history', label: 'History', icon: History, count: revisions.length || undefined}] : [])]}/>
        {tab === 'document' && <>
        <Panel title="Publish">
          <dl className="ed-facts"><dt>Status</dt><dd><StatusChip status={item.status}/></dd>{when && <><dt>Goes live</dt><dd>{time(when)}</dd></>}{item.status === 'published' && <><dt>Published</dt><dd>{time(item.publishedAt)}</dd></>}</dl>
          {publisher && item.status !== 'published' && <div className="ed-schedule"><label><span className="ed-lbl"><CalendarClock size={14} aria-hidden="true"/> Schedule for</span><input type="datetime-local" value={scheduleAt} min={localInput(new Date())} onChange={event => setScheduleAt(event.target.value)}/></label><button type="button" disabled={problems.length > 0 || !scheduleAt} onClick={schedule}>{item.status === 'scheduled' ? 'Reschedule' : 'Schedule'}</button><small>Uses your local time ({Intl.DateTimeFormat().resolvedOptions().timeZone}).</small></div>}
          {publisher && (item.status === 'draft' || item.status === 'published') && <label>Publication date<input type="date" value={item.publishedOn ?? dateInput(item.publishedAt)} onChange={event => touch({publishedOn: event.target.value})}/><small>Leave empty to use the moment of publishing.</small></label>}
          <div className="ed-switch"><span>Feature this {type}</span><Switch label={`Feature this ${type}`} checked={Boolean(item.featured)} onChange={value => touch({featured: value})}/></div>
          {(problems.length > 0 || warnings.length > 0) && <div className="ed-checks" aria-label="Before you publish">{problems.map(text => <p key={text} className="is-error">{text}</p>)}{warnings.map(text => <p key={text} className="is-warn">{text}</p>)}</div>}
          <div className="ed-actions">
            {publisher && item.status === 'published' && <button type="button" onClick={() => save('draft')}>Switch to draft</button>}
            {publisher && item.status === 'scheduled' && <button type="button" onClick={() => save('draft')}>Cancel schedule</button>}
            {publisher && item.id && item.status !== 'archived' && <button type="button" onClick={() => save('archived')}>Archive</button>}
            {item.status === 'published' && <a href={slugPath} target="_blank" rel="noreferrer">View live</a>}
            {remover && item.id && <button type="button" className="is-danger" onClick={async () => {if (!await confirm({title: 'Delete this item?', message: 'It can no longer be opened.', confirm: 'Delete', danger: true})) return; try {await api(`/api/staff/content/${item.id}`, {method: 'DELETE'}); setUnsaved(false); window.location.hash = `#/content/${type}`;} catch (reason) {setError(reason.message);}}}>Delete</button>}
          </div>
        </Panel>
        <Panel title="Excerpt"><label className="fa-sr" htmlFor="ed-excerpt">Excerpt</label><textarea id="ed-excerpt" rows={4} value={item.summary} maxLength={500} onChange={event => touch({summary: event.target.value})} placeholder="A short summary shown on cards and in search results"/><small>{item.summary.length}/500</small></Panel>
        <Panel title="Featured image">
          {item.image ? <div className="ed-featured"><img src={item.image} alt={item.imageAlt || ''}/>{!item.imageAlt && <small className="is-warn">This image has no alt text. Add it in the media library.</small>}<div><button type="button" onClick={() => setPicker('featured')}>Replace</button><button type="button" onClick={() => touch({featuredMediaId: null, image: ''})}>Remove</button></div></div> : <button type="button" onClick={() => setPicker('featured')}>Set featured image</button>}
          <label>Image fit<select value={item.imageFit || 'cover'} onChange={event => touch({imageFit: event.target.value})}><option value="cover">Fill the card (may crop)</option><option value="contain">Show the whole image</option></select></label>
        </Panel>
        <Panel title="Categories and tags">
          <label>Category<select value={item.category || ''} onChange={event => touch({category: event.target.value})}><option value="">No category</option>{categoryNames.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
          {manager && <NewTerm label="Add a new category" onAdd={name => {touch({category: name}); setTerms(current => ({...current, category: [...current.category, {id: `new-${name}`, name}]}));}}/>}
          <div className="ed-tags"><span id="ed-tags-label">Tags</span><ul aria-labelledby="ed-tags-label">{item.tags.map(tag => <li key={tag}>{tag}<button type="button" aria-label={`Remove tag ${tag}`} onClick={() => touch({tags: item.tags.filter(other => other !== tag)})}><X size={12}/></button></li>)}</ul>
            <input list="ed-tag-options" aria-label="Add a tag" placeholder="Type a tag, press Enter" onKeyDown={event => {if (event.key === 'Enter' || event.key === ',') {event.preventDefault(); addTag(event.target.value); event.target.value = '';}}} onBlur={event => {addTag(event.target.value); event.target.value = '';}}/>
            <datalist id="ed-tag-options">{terms.tag.filter(term => !item.tags.includes(term.name)).map(term => <option key={term.id} value={term.name}/>)}</datalist></div>
        </Panel>
        <Panel title="Author and place"><label>Author<input value={item.authorName || ''} onChange={event => touch({authorName: event.target.value})}/></label>{type === 'news' && <label>Place<input value={item.location || ''} onChange={event => touch({location: event.target.value})}/></label>}</Panel>
        </>}
        {tab === 'seo' && <>
        <Panel title="Search appearance">
          <label>SEO title<input value={item.seoTitle || ''} onChange={event => touch({seoTitle: event.target.value})} placeholder={item.title}/><small className={(item.seoTitle || item.title).length > 60 ? 'is-warn' : ''}>{(item.seoTitle || item.title).length}/60</small></label>
          <label>Meta description<textarea rows={3} value={item.seoDescription || ''} onChange={event => touch({seoDescription: event.target.value})}/><small className={(item.seoDescription || '').length > 160 ? 'is-warn' : ''}>{(item.seoDescription || '').length}/160</small></label>
          <div className="ed-snippet" aria-label="Search result preview"><span>foreignafrica.org{slugPath}</span><strong>{item.seoTitle || item.title || 'Untitled'}</strong><p>{item.seoDescription || item.summary || 'No description.'}</p></div>
          <button type="button" onClick={() => setPicker('social')}>{item.socialImageId ? 'Change social image' : 'Set social image'}</button>{item.socialImageId && <button type="button" onClick={() => touch({socialImageId: null, socialImage: ''})}>Remove</button>}
        </Panel>
        </>}
        {tab === 'history' && item.id && <Panel title="Revisions" hint={revisions.length ? String(revisions.length) : ''}>
          {revisions.length ? <ul className="ed-revisions">{revisions.map(revision => <li key={revision.id}><button type="button" className="ed-linkish" onClick={() => setCompare(compare?.id === revision.id ? null : revision)}>{time(revision.createdAt)}</button> <small>{revision.editorName}</small></li>)}</ul> : <p className="studio-hint">No revisions yet.</p>}
          {compare && <div className="ed-compare"><h3>{compare.title}</h3><p>{compare.text || 'No text.'}</p>{manager && <button type="button" onClick={async () => {if (dirty && !await confirm({title: 'Restore this version?', message: 'Restoring replaces your unsaved edits.', confirm: 'Restore'})) return; try {const restored = await api(`/api/staff/content/${item.id}/restore`, {method: 'POST', body: {revisionId: compare.id}}); editor.commands.setContent(restored.item.document); setItem({...restored.item, publishedOn: dateInput(restored.item.publishedAt)}); setEdits(0); setCompare(null); setState('Revision restored as a draft.'); loadRevisions(item.id);} catch (reason) {setError(reason.message);}}}>Restore this version</button>}</div>}
        </Panel>}
      </aside>
    </div>
    {picker && <MediaPicker accept={picker === 'pdf' ? 'pdf' : 'image'} user={user} onClose={() => setPicker('')} onSelect={file => {
      if (picker === 'pdf') editor.chain().focus().insertContent({type: 'text', text: file.title || file.name, marks: [{type: 'link', attrs: {href: file.url}}]}).run();
      else if (picker === 'featured') touch({featuredMediaId: file.id, image: file.url, imageAlt: file.alt});
      else if (picker === 'social') touch({socialImageId: file.id, socialImage: file.url});
      else insertBlock(editor, {type: 'image', attrs: {src: file.url, alt: file.alt || '', caption: file.caption || ''}});
      setPicker('');
    }}/>}
  </div>;
}

function NewTerm({label, onAdd}) {
  const [value, setValue] = useState('');
  return <div className="ed-newterm"><input aria-label={label} placeholder={label} value={value} onChange={event => setValue(event.target.value)} onKeyDown={event => {if (event.key === 'Enter') {event.preventDefault(); if (value.trim()) {onAdd(value.trim()); setValue('');}}}}/><button type="button" disabled={!value.trim()} onClick={() => {onAdd(value.trim()); setValue('');}}>Add</button></div>;
}
