import React, {useEffect, useState} from 'react';
import {allows} from '../../server/permissions.js';

const statuses = [['new', 'New'], ['in_review', 'In review'], ['actioned', 'Actioned'], ['archived', 'Archived']];
const label = value => statuses.find(([key]) => key === value)?.[1] ?? value;
const when = value => (value ? new Date(value).toLocaleString('en-GB', {dateStyle: 'medium', timeStyle: 'short'}) : '');

export default function Submissions({user, api, id}) {
  const [list, setList] = useState(null);
  const [filters, setFilters] = useState({status: '', form: '', mine: false});
  const [error, setError] = useState('');
  const query = `status=${filters.status}&form=${encodeURIComponent(filters.form)}&mine=${filters.mine ? 1 : 0}`;
  useEffect(() => {if (!id) api(`/api/staff/submissions?${query}`).then(setList).catch(reason => setError(reason.message));}, [query, id]);
  if (id) return <SubmissionDetail user={user} api={api} id={id}/>;
  if (error) return <p className="studio-alert" role="alert">{error}</p>;
  return <>
    <div className="studio-bar"><h1>Submissions</h1>{allows(user.roles, 'submissions.export') && <a className="studio-button" href={`/api/staff/submissions.csv?status=${filters.status}&form=${encodeURIComponent(filters.form)}`}>Export CSV</a>}</div>
    <p className="studio-hint">Private. Only administrators can see this page. Opening, listing and exporting submissions is recorded in the activity log.</p>
    <div className="studio-filters">
      <label>Status<select value={filters.status} onChange={event => setFilters({...filters, status: event.target.value})}><option value="">All</option>{statuses.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>
      <label>Form<input value={filters.form} onChange={event => setFilters({...filters, form: event.target.value})} placeholder="e.g. general_enquiry"/></label>
      <label className="studio-check"><input type="checkbox" checked={filters.mine} onChange={event => setFilters({...filters, mine: event.target.checked})}/> Assigned to me</label>
    </div>
    {!list ? <p>Loading…</p> : !list.items.length ? <p className="studio-empty">No submissions match these filters.</p> :
      <table className="studio-table"><thead><tr><th scope="col">Reference</th><th scope="col">Form</th><th scope="col">Status</th><th scope="col">Assigned</th><th scope="col">Received</th></tr></thead>
        <tbody>{list.items.map(item => <tr key={item.id}><td><a href={`#/submissions/${item.id}`}>{item.reference}</a></td><td>{item.formTitle}</td><td><span className={`studio-badge is-${item.status}`}>{label(item.status)}</span></td><td>{item.assigneeName || '—'}</td><td>{when(item.createdAt)}</td></tr>)}</tbody></table>}
    {list && <p className="studio-hint">{list.total} submission{list.total === 1 ? '' : 's'}</p>}
  </>;
}

function SubmissionDetail({user, api, id}) {
  const [item, setItem] = useState(null);
  const [people, setPeople] = useState([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const manage = allows(user.roles, 'submissions.manage');
  useEffect(() => {
    api(`/api/staff/submissions/${id}`).then(data => setItem(data.item)).catch(reason => setError(reason.message));
    if (allows(user.roles, 'users.read')) api('/api/staff/users').then(data => setPeople(data.users.filter(person => ['super_admin', 'admin'].includes(person.role) && person.status === 'active'))).catch(() => {});
  }, [id]);
  const change = async body => {setError(''); try {setItem((await api(`/api/staff/submissions/${id}`, {method: 'PATCH', body})).item);} catch (reason) {setError(reason.message);}};
  if (error && !item) return <p className="studio-alert" role="alert">{error}</p>;
  if (!item) return <p>Loading…</p>;
  return <>
    <div className="studio-bar"><h1>{item.reference}</h1><a href="#/submissions">Back to submissions</a></div>
    {error && <p className="studio-alert" role="alert">{error}</p>}
    <p className="studio-hint">{item.formTitle} · received {when(item.createdAt)}</p>
    <div className="studio-columns">
      <section><h2>Answers</h2><dl className="studio-answers">{item.fields.map(field => <React.Fragment key={field.id}><dt>{field.label}</dt><dd>{item.answers[field.id] || '—'}</dd></React.Fragment>)}</dl></section>
      <aside>
        <h2>Handling</h2>
        <label>Status<select value={item.status} disabled={!manage} onChange={event => change({status: event.target.value})}>{statuses.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>
        <label>Assigned to<select value={item.assignedTo ?? ''} disabled={!manage || !people.length} onChange={event => change({assignedTo: event.target.value ? Number(event.target.value) : null})}><option value="">Unassigned</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
        <h2>Notes</h2>
        {item.notes.length ? <ul className="studio-notes">{item.notes.map(entry => <li key={entry.id}><strong>{entry.author}</strong> <small>{when(entry.createdAt)}</small><p>{entry.note}</p></li>)}</ul> : <p className="studio-empty">No notes yet.</p>}
        {manage && <form onSubmit={async event => {event.preventDefault(); setError(''); try {setItem((await api(`/api/staff/submissions/${id}/notes`, {method: 'POST', body: {note}})).item); setNote('');} catch (reason) {setError(reason.message);}}}>
          <label>Add a note<textarea rows={3} maxLength={4000} value={note} onChange={event => setNote(event.target.value)}/></label><button type="submit" disabled={!note.trim()}>Add note</button></form>}
      </aside>
    </div>
  </>;
}
