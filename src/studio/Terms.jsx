import React, {useCallback, useEffect, useState} from 'react';
import {allows} from '../../server/permissions.js';
import {api} from './api.js';

export default function Terms({user}) {
  const [vocabulary, setVocabulary] = useState('category');
  const [terms, setTerms] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [edit, setEdit] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [mergeInto, setMergeInto] = useState('');
  const [name, setName] = useState('');
  const manage = allows(user.roles, 'terms.manage');
  const label = vocabulary === 'category' ? 'category' : 'tag';
  const load = useCallback(() => api(`/api/staff/terms?vocabulary=${vocabulary}`).then(data => setTerms(data.terms)).catch(reason => setError(reason.message)), [vocabulary]);
  useEffect(() => {setTerms(null); setEdit(null); setRemoving(null); load();}, [load]);
  const run = async (task, done) => {setError(''); setNotice(''); try {await task(); setNotice(done); load();} catch (reason) {setError(reason.message);}};

  return <>
    <div className="studio-bar"><h1>Categories and tags</h1></div>
    <p className="studio-hint">Categories group articles; each article has one. Tags are free-form labels; an article can have several. Renaming here updates every article that uses the term.</p>
    <div className="ml-views terms-tabs" role="tablist" aria-label="Kind">{[['category', 'Categories'], ['tag', 'Tags']].map(([key, text]) => <button key={key} type="button" role="tab" aria-selected={vocabulary === key} aria-pressed={vocabulary === key} onClick={() => setVocabulary(key)}>{text}</button>)}</div>
    {error && <p className="studio-alert" role="alert">{error}</p>}{notice && <p className="studio-notice" role="status">{notice}</p>}
    {manage && <form className="studio-filters" onSubmit={event => {event.preventDefault(); run(async () => {await api('/api/staff/terms', {method: 'POST', body: {vocabulary, name}}); setName('');}, `Added the ${label}.`);}}>
      <label>Add a {label}<input value={name} maxLength={160} onChange={event => setName(event.target.value)} placeholder={vocabulary === 'category' ? 'e.g. Trade and investment' : 'e.g. AfCFTA'}/></label><button type="submit" disabled={!name.trim()}>Add {label}</button></form>}
    {!terms ? <p>Loading…</p> : !terms.length ? <p className="studio-empty">No {label === 'category' ? 'categories' : 'tags'} yet.</p> :
      <table className="studio-table"><thead><tr><th scope="col">Name</th><th scope="col">Slug</th><th scope="col">Items</th><th scope="col"><span className="studio-sr">Actions</span></th></tr></thead>
        <tbody>{terms.map(term => edit?.id === term.id
          ? <tr key={term.id}><td><input aria-label="Name" value={edit.name} onChange={event => setEdit({...edit, name: event.target.value})}/></td><td><input aria-label="Slug" value={edit.slug} onChange={event => setEdit({...edit, slug: event.target.value})}/></td><td>{term.uses}</td><td><button type="button" onClick={() => run(async () => {await api(`/api/staff/terms/${term.id}`, {method: 'PATCH', body: {name: edit.name, slug: edit.slug}}); setEdit(null);}, 'Saved.')}>Save</button> <button type="button" onClick={() => setEdit(null)}>Cancel</button></td></tr>
          : <tr key={term.id}><td>{term.name}</td><td><code>{term.slug}</code></td><td>{term.uses}</td><td>{manage && <><button type="button" onClick={() => setEdit({id: term.id, name: term.name, slug: term.slug})}>Edit</button> <button type="button" className="is-danger" onClick={() => {setRemoving(term); setMergeInto('');}}>Delete</button></>}</td></tr>)}</tbody></table>}
    {removing && <div className="studio-panel" role="group" aria-label={`Delete ${removing.name}`}>
      <h2>Delete “{removing.name}”</h2>
      {removing.uses ? <p>It is used by {removing.uses} item{removing.uses === 1 ? '' : 's'}. Move them to another {label}, or remove this {label} from them.</p> : <p>It is not used by any item.</p>}
      {removing.uses > 0 && <label>Merge into<select value={mergeInto} onChange={event => setMergeInto(event.target.value)}><option value="">Choose…</option>{terms.filter(term => term.id !== removing.id).map(term => <option key={term.id} value={term.id}>{term.name}</option>)}</select></label>}
      <div className="studio-actions">
        {removing.uses > 0 && <button type="button" disabled={!mergeInto} onClick={() => run(async () => {await api(`/api/staff/terms/${removing.id}?mergeInto=${mergeInto}`, {method: 'DELETE'}); setRemoving(null);}, 'Merged and deleted.')}>Merge and delete</button>}
        <button type="button" className="is-danger" onClick={() => run(async () => {await api(`/api/staff/terms/${removing.id}${removing.uses ? '?detach=1' : ''}`, {method: 'DELETE'}); setRemoving(null);}, 'Deleted.')}>{removing.uses ? 'Remove from items and delete' : 'Delete'}</button>
        <button type="button" onClick={() => setRemoving(null)}>Cancel</button></div></div>}
  </>;
}
