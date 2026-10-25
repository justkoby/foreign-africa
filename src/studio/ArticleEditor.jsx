import React, {useEffect, useState} from 'react';
import {useEditor, EditorContent} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import {allows} from '../../server/permissions.js';
import {MediaPicker} from './MediaLibrary.jsx';

const Figure = Image.extend({
  addAttributes() {
    return {src: {default: null}, alt: {default: ''}, caption: {default: ''}, href: {default: null}};
  },
});

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
  const load = next => api(`/api/staff/content?type=${type}&q=${encodeURIComponent(query)}&status=${status}&sort=${sort}&page=${next}&pageSize=20`).then(data => setPage(data)).catch(reason => setError(reason.message));
  useEffect(() => {load(current);}, [type, current, status, sort]);
  const publisher = allows(user.roles, 'content.publish');
  return <><div className="studio-bar"><h1>{label}</h1><a className="studio-button" href={`#/content/${type}/new`}>Add new</a></div><form onSubmit={event => {event.preventDefault(); setCurrent(1); load(1);}}><input aria-label={`Search ${label}`} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by title"/><select aria-label="Status" value={status} onChange={event => {setStatus(event.target.value); setCurrent(1);}}><option value="">Any status</option><option value="draft">Draft</option><option value="published">Published</option><option value="scheduled">Scheduled</option><option value="archived">Archived</option></select><select aria-label="Sort" value={sort} onChange={event => setSort(event.target.value)}><option value="updated">Last modified</option><option value="published">Publication date</option><option value="title">Title</option></select><button type="submit">Search</button></form>{error && <p className="studio-alert" role="alert">{error}</p>}{page && !page.items.length && <p>No {label.toLowerCase()} yet.</p>}<table><tbody>{page?.items.map(item => <tr key={item.id}><td>{item.image && <img className="studio-thumb" src={item.image} alt=""/>}</td><td><a href={`#/content/${type}/${item.id}`}>{item.title}</a><small>{item.category}</small></td><td>{item.authorName}</td><td>{item.status}</td><td>{dateInput(item.publishedAt)}</td><td>{dateInput(item.updatedAt)}</td><td>{publisher && <button type="button" onClick={async () => {const copy = await api(`/api/staff/content/${item.id}/duplicate`, {method: 'POST', body: {}}); window.location.hash = `#/content/${type}/${copy.item.id}`;}}>Duplicate</button>}</td></tr>)}</tbody></table>{page && page.total > page.pageSize && <div className="studio-actions"><button type="button" disabled={current === 1} onClick={() => setCurrent(value => value - 1)}>Previous</button><span>Page {page.page}</span><button type="button" disabled={current * page.pageSize >= page.total} onClick={() => setCurrent(value => value + 1)}>Next</button></div>}</>;
}

export function ContentEditor({type, id, user}) {
  const [item, setItem] = useState(null);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [picker, setPicker] = useState('');
  const [revisions, setRevisions] = useState([]);
  const [compare, setCompare] = useState(null);
  const editor = useEditor({
    extensions: [StarterKit.configure({heading: {levels: [2, 3, 4]}}), Underline, Link.configure({openOnClick: false}), Figure],
    content: item?.document || {type: 'doc', content: []},
    onUpdate: () => {setDirty(true); setSaved('');},
  }, [item?.id]);
  useEffect(() => {if (id === 'new') {setItem({title: '', slug: '', summary: '', document: {type: 'doc', content: []}, seoTitle: '', seoDescription: '', status: 'draft', authorName: user.name, category: '', tags: [], featured: false, location: '', imageFit: 'cover'}); return;} api(`/api/staff/content/${id}`).then(data => {setItem(data.item); setDirty(false); editor?.commands.setContent(data.item.document || {type: 'doc', content: []});}).catch(reason => setError(reason.message)); api(`/api/staff/content/${id}/revisions`).then(data => setRevisions(data.revisions)).catch(() => {});}, [id, user.name, editor]);
  useEffect(() => {const warn = event => {if (dirty) event.preventDefault();}; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);}, [dirty]);
  useEffect(() => {if (!dirty || !item?.id || item.status !== 'draft') return undefined; const timer = setTimeout(() => save(), 4000); return () => clearTimeout(timer);}, [dirty, item?.title, item?.summary]);
  if (error && !item) return <p className="studio-alert" role="alert">{error}</p>;
  if (!item || !editor) return <p>Loading editor…</p>;
  const publisher = allows(user.roles, 'content.publish');
  const remover = allows(user.roles, 'content.delete');
  const payload = () => ({type, title: item.title, slug: item.slug, summary: item.summary, document: editor.getJSON(), seoTitle: item.seoTitle, seoDescription: item.seoDescription, authorName: item.authorName, category: item.category, tags: String(item.tagsText ?? item.tags.join(', ')).split(',').map(tag => tag.trim()).filter(Boolean), featured: item.featured, featuredMediaId: item.featuredMediaId, socialImageId: item.socialImageId, location: item.location, imageFit: item.imageFit, publishedAt: item.publishedOn || undefined});
  async function save(status) {
    setError(''); setSaved('Saving…');
    try {
      const body = payload();
      const data = item.id ? await api(`/api/staff/content/${item.id}`, {method: 'PATCH', body}) : await api('/api/staff/content', {method: 'POST', body});
      let next = data.item;
      if (status && status !== next.status) next = (await api(`/api/staff/content/${next.id}/state`, {method: 'POST', body: {status, publishedAt: item.publishedOn}})).item;
      setItem({...next, tagsText: undefined, publishedOn: dateInput(next.publishedAt)});
      setDirty(false); setSaved(status ? 'Saved.' : 'Draft saved.');
      if (!item.id) window.location.hash = `#/content/${type}/${next.id}`;
      if (next.id) setRevisions((await api(`/api/staff/content/${next.id}/revisions`)).revisions);
    } catch (reason) {setError(reason.message); setSaved('');}
  }
  const command = (name, attributes) => {editor.chain().focus()[name](attributes).run();};
  const wide = typeof window !== 'undefined' && window.matchMedia('(min-width: 801px)').matches;
  return <form className="studio-editor" onSubmit={event => {event.preventDefault(); save(item.status === 'new' ? undefined : undefined);}}>
    <div className="studio-canvas"><p><a href={`#/content/${type}`}>Back to {type}</a></p><label>Title<input className="cms-title" value={item.title} onChange={event => {setItem({...item, title: event.target.value}); setDirty(true);}}/></label>
      <div className="studio-toolbar" role="toolbar" aria-label="Formatting">{[['toggleBold', 'Bold'], ['toggleItalic', 'Italic'], ['toggleUnderline', 'Underline']].map(([name, label]) => <button type="button" key={name} aria-pressed={editor.isActive(name.replace('toggle', '').toLowerCase())} onClick={() => command(name)}>{label}</button>)}{[2, 3, 4].map(level => <button type="button" key={level} aria-pressed={editor.isActive('heading', {level})} onClick={() => command('toggleHeading', {level})}>H{level}</button>)}<button type="button" aria-pressed={editor.isActive('bulletList')} onClick={() => command('toggleBulletList')}>List</button><button type="button" aria-pressed={editor.isActive('orderedList')} onClick={() => command('toggleOrderedList')}>Numbered</button><button type="button" aria-pressed={editor.isActive('blockquote')} onClick={() => command('toggleBlockquote')}>Quote</button><button type="button" onClick={() => command('setHorizontalRule')}>Divider</button><button type="button" onClick={() => {const href = window.prompt('Link address', editor.getAttributes('link').href || 'https://'); if (href === null) return; if (!href) editor.chain().focus().unsetLink().run(); else editor.chain().focus().extendMarkRange('link').setLink({href}).run();}}>Link</button><button type="button" onClick={() => setPicker('image')}>Image</button><button type="button" onClick={() => setPicker('pdf')}>Document</button><button type="button" onClick={() => {const caption = window.prompt('Image caption', editor.getAttributes('image').caption || ''); if (caption !== null) editor.chain().focus().updateAttributes('image', {caption}).run();}}>Caption</button><button type="button" onClick={() => editor.chain().focus().undo().run()}>Undo</button><button type="button" onClick={() => editor.chain().focus().redo().run()}>Redo</button></div>
      <div className="studio-prose"><EditorContent editor={editor}/></div>{(picker === 'image' || picker === 'pdf') && <MediaPicker accept={picker === 'pdf' ? 'pdf' : 'image'} onClose={() => setPicker('')} onSelect={file => {if (picker === 'pdf') editor.chain().focus().insertContent({type: 'text', text: file.name, marks: [{type: 'link', attrs: {href: file.url}}]}).run(); else editor.chain().focus().setImage({src: file.url, alt: file.alt || ''}).run(); setPicker(''); setDirty(true);}}/>}</div>
    <aside className="studio-sidepanel"><details open={wide}><summary>Article settings</summary>
      <p>Status: {item.status || 'draft'}</p>
      <label>Slug<input value={item.slug || ''} onChange={event => {setItem({...item, slug: event.target.value}); setDirty(true);}} placeholder="Leave blank to use the title"/></label>
      <label>Excerpt<textarea value={item.summary || ''} onChange={event => {setItem({...item, summary: event.target.value}); setDirty(true);}}/></label>
      <label>Author<input value={item.authorName || ''} onChange={event => {setItem({...item, authorName: event.target.value}); setDirty(true);}}/></label>
      <label>Category<input value={item.category || ''} onChange={event => {setItem({...item, category: event.target.value}); setDirty(true);}}/></label>
      <label>Tags<input value={item.tagsText ?? (item.tags || []).join(', ')} onChange={event => {setItem({...item, tagsText: event.target.value}); setDirty(true);}} placeholder="Separated by commas"/></label>
      <label>Place<input value={item.location || ''} onChange={event => {setItem({...item, location: event.target.value}); setDirty(true);}}/></label>
      <label>Publication date<input type="date" value={item.publishedOn ?? dateInput(item.publishedAt)} onChange={event => {setItem({...item, publishedOn: event.target.value}); setDirty(true);}}/></label>
      <label><input type="checkbox" checked={Boolean(item.featured)} onChange={event => {setItem({...item, featured: event.target.checked}); setDirty(true);}}/> Featured article</label>
      <p>Featured image</p>{item.image && <img src={item.image} alt=""/>}<button type="button" onClick={() => setPicker('featured')}>Select featured image</button>
      <p>Social image</p><button type="button" onClick={() => setPicker('social')}>Select social image</button>
      {picker === 'featured' || picker === 'social' ? <MediaPicker accept="image" onClose={() => setPicker('')} onSelect={file => {setItem(current => picker === 'social' ? {...current, socialImageId: file.id, socialImage: file.url} : {...current, featuredMediaId: file.id, image: file.url}); setPicker(''); setDirty(true);}}/> : null}
      <label>SEO title<input value={item.seoTitle || ''} onChange={event => setItem({...item, seoTitle: event.target.value})}/> </label>
      <label>Meta description<textarea value={item.seoDescription || ''} onChange={event => setItem({...item, seoDescription: event.target.value})}/></label>
      {error && <p className="studio-alert" role="alert">{error}</p>}{saved && <p role="status">{saved}</p>}
      <div className="studio-actions"><button type="button" onClick={() => save()}>{!item.id || item.status === 'draft' ? 'Save draft' : 'Update'}</button>{publisher && <button type="button" onClick={() => save('published')}>Publish</button>}{publisher && <button type="button" onClick={() => save('scheduled')}>Schedule</button>}{publisher && item.id && <button type="button" onClick={() => save('draft')}>Unpublish</button>}{publisher && item.id && <button type="button" onClick={() => save('archived')}>Archive</button>}{item.id && <a href={`/api/staff/content/${item.id}/preview`} target="_blank" rel="noreferrer">Preview</a>}{item.status === 'published' && <a href={type === 'news' ? `/news/${item.slug}/` : `/${item.slug}/`}>View</a>}{remover && item.id && <button type="button" onClick={async () => {if (!window.confirm('Delete this page?')) return; await api(`/api/staff/content/${item.id}`, {method: 'DELETE'}); window.location.hash = `#/content/${type}`;}}>Delete</button>}</div>
      {!!revisions.length && <><h2>Revisions</h2><ul>{revisions.map(revision => <li key={revision.id}><button type="button" onClick={() => setCompare(revision)}>{revision.editorName} · {String(revision.createdAt).slice(0, 16)}</button> {allows(user.roles, 'content.update.any') && <button type="button" onClick={async () => {const restored = await api(`/api/staff/content/${item.id}/restore`, {method: 'POST', body: {revisionId: revision.id}}); setItem(restored.item); editor.commands.setContent(restored.item.document); setRevisions((await api(`/api/staff/content/${item.id}/revisions`)).revisions);}}>Restore</button>}</li>)}</ul>{compare && <div><h3>{compare.title}</h3><p>{compare.text}</p><p>Current: {item.body}</p></div>}</>}
    </details></aside>
  </form>;
}
