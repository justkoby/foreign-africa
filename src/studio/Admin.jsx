import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Activity as ActivityIcon, CheckCircle2, Database, HardDrive, KeyRound, Plus, ShieldCheck, TimerReset, UserPlus, XCircle, AlertTriangle} from 'lucide-react';
import {allows} from '../../server/permissions.js';
import {api} from './api.js';
import {Avatar, Button, Card, CardHeader, Chip, EmptyState, Field, Modal, Notice, PageHeader, SearchField, Select, Skeleton, ago, fmtDateTime, useFeedback} from './ui/index.jsx';

const roleLabel = {super_admin: 'Super admin', admin: 'Admin', editor: 'Editor', contributor: 'Contributor'};
const roleTone = {super_admin: 'violet', admin: 'blue', editor: 'green', contributor: ''};
const roleNote = {admin: 'Manages users, settings and all content.', editor: 'Edits and publishes all content.', contributor: 'Writes drafts and submits them for review.'};

function Loading() {return <div className="fa-page" aria-busy="true"><Skeleton width={220} height={34}/><Skeleton height={260}/></div>;}
const Failed = ({error}) => <div className="fa-page"><Notice tone="danger" title="This page could not be loaded">{error}</Notice></div>;

function useLoad(path) {
  const [state, setState] = useState({data: null, error: ''});
  const load = useCallback(() => api(path).then(data => setState({data, error: ''})).catch(reason => setState({data: null, error: reason.message})), [path]);
  useEffect(() => {load();}, [load]);
  return [state, load];
}

export function Users({user}) {
  const [{data, error}, load] = useLoad('/api/staff/users');
  const {toast, confirm} = useFeedback();
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [adding, setAdding] = useState(false);
  const manage = allows(user.roles, 'users.manage');
  const rows = useMemo(() => (data?.users ?? []).filter(person => (!role || person.role === role) && (!query || `${person.name} ${person.email}`.toLowerCase().includes(query.toLowerCase()))), [data, query, role]);
  if (error) return <Failed error={error}/>;
  if (!data) return <Loading/>;
  async function toggle(person) {
    const disabling = person.status === 'active';
    if (disabling && !await confirm({title: `Disable ${person.name}?`, message: 'They will be signed out and unable to sign in until you enable the account again.', confirm: 'Disable account', danger: true})) return;
    try {await api(`/api/staff/users/${person.id}`, {method: 'PATCH', body: {status: disabling ? 'disabled' : 'active'}}); toast(`${person.name} ${disabling ? 'disabled' : 'enabled'}.`, 'success'); load();} catch (reason) {toast(reason.message, 'danger');}
  }
  return <div className="fa-page">
    <PageHeader title="Users" subtitle="People who can sign in to the studio, and what they can do." actions={manage && <Button variant="primary" icon={UserPlus} onClick={() => setAdding(true)}>Add user</Button>}/>
    <Card>
      <div className="fa-toolbar"><SearchField value={query} onChange={setQuery} placeholder="Search by name or email" label="Search users"/>
        <Select pill aria-label="Filter by role" value={role} onChange={event => setRole(event.target.value)}><option value="">All roles</option>{Object.entries(roleLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></div>
      {rows.length ? <div className="fa-table-wrap"><table className="fa-table"><thead><tr><th scope="col">User</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col"><span className="fa-sr">Actions</span></th></tr></thead><tbody>{rows.map(person => <tr key={person.id}>
        <td><div className="fa-person"><Avatar name={person.name}/><span><strong>{person.name}</strong><small>{person.email}</small></span></div></td>
        <td><Chip tone={roleTone[person.role]}>{roleLabel[person.role] ?? person.role}</Chip></td>
        <td><Chip tone={person.status === 'active' ? 'green' : ''} dot>{person.status === 'active' ? 'Active' : 'Disabled'}</Chip></td>
        <td style={{textAlign: 'right'}}>{manage && person.id !== user.id && <Button size="sm" variant={person.status === 'active' ? 'danger' : 'soft'} onClick={() => toggle(person)}>{person.status === 'active' ? 'Disable' : 'Enable'}</Button>}{person.id === user.id && <small className="fa-muted">This is you</small>}</td>
      </tr>)}</tbody></table></div> : <EmptyState title="No users match" icon={ShieldCheck}>Try a different search or role.</EmptyState>}
    </Card>
    {adding && <AddUser onClose={() => setAdding(false)} onDone={name => {setAdding(false); toast(`${name} can now sign in.`, 'success'); load();}}/>}
  </div>;
}

function AddUser({onClose, onDone}) {
  const [form, setForm] = useState({name: '', email: '', role: 'editor', password: ''});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = key => event => setForm({...form, [key]: event.target.value});
  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try {await api('/api/staff/users', {method: 'POST', body: form}); onDone(form.name);} catch (reason) {setError(reason.message); setBusy(false);}
  }
  return <Modal title="Add a staff account" icon={UserPlus} onClose={onClose}>
    <form className="fa-form" onSubmit={submit}>
      <Field label="Full name"><input className="fa-input" value={form.name} onChange={set('name')} required autoFocus/></Field>
      <Field label="Email address"><input className="fa-input" type="email" value={form.email} onChange={set('email')} required/></Field>
      <Field label="Role" hint={roleNote[form.role]}><Select value={form.role} onChange={set('role')}>{['admin', 'editor', 'contributor'].map(key => <option key={key} value={key}>{roleLabel[key]}</option>)}</Select></Field>
      <Field label="Temporary password" hint="At least 12 characters. Ask them to change it after signing in."><input className="fa-input" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} required minLength={12}/></Field>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="fa-modal-actions"><Button type="button" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" icon={Plus} disabled={busy}>Create account</Button></div>
    </form>
  </Modal>;
}

export function Account({user}) {
  const [form, setForm] = useState({currentPassword: '', newPassword: ''});
  const [error, setError] = useState('');
  const {toast} = useFeedback();
  async function submit(event) {
    event.preventDefault(); setError('');
    try {await api('/api/staff/me/password', {method: 'POST', body: form}); setForm({currentPassword: '', newPassword: ''}); toast('Password changed.', 'success');} catch (reason) {setError(reason.message);}
  }
  return <div className="fa-page fa-narrow">
    <PageHeader title="Your account" subtitle="Your details and sign-in security."/>
    <Card pad><div className="fa-person fa-person-lg"><Avatar name={user.name} size="lg"/><span><strong>{user.name}</strong><small>{user.email}</small></span><Chip tone={roleTone[user.roles?.[0]]}>{roleLabel[user.roles?.[0]] ?? 'Staff'}</Chip></div></Card>
    <Card pad><h2 className="fa-h2"><KeyRound size={18} aria-hidden="true"/> Change password</h2>
      <form className="fa-form" onSubmit={submit}>
        <Field label="Current password"><input className="fa-input" type="password" autoComplete="current-password" value={form.currentPassword} onChange={event => setForm({...form, currentPassword: event.target.value})} required/></Field>
        <Field label="New password" hint="At least 12 characters."><input className="fa-input" type="password" autoComplete="new-password" value={form.newPassword} onChange={event => setForm({...form, newPassword: event.target.value})} required minLength={12}/></Field>
        {error && <Notice tone="danger">{error}</Notice>}
        <div><Button type="submit" variant="primary">Update password</Button></div>
      </form></Card>
  </div>;
}

const actionText = action => String(action).replace(/[._]/g, ' ').replace(/^./, c => c.toUpperCase());
export function Activity() {
  const [{data, error}] = useLoad('/api/staff/activity');
  if (error) return <Failed error={error}/>;
  if (!data) return <Loading/>;
  return <div className="fa-page fa-narrow">
    <PageHeader title="Activity" subtitle="The most recent actions taken in the studio."/>
    <Card>{data.activity.length ? <ol className="fa-timeline fa-pad">{data.activity.map(item => <li key={item.id}><span className="fa-dot" aria-hidden="true"><ActivityIcon size={13}/></span><div><strong>{actionText(item.action)}</strong>{item.subjectType && <span className="fa-muted"> · {item.subjectType}{item.subjectId ? ` #${item.subjectId}` : ''}</span>}<small title={fmtDateTime(item.createdAt)}>{ago(item.createdAt)} · {fmtDateTime(item.createdAt)}</small></div></li>)}</ol> : <EmptyState title="No activity yet" icon={ActivityIcon}>Actions such as publishing and sign-ins appear here.</EmptyState>}</Card>
  </div>;
}

const tone = status => (status === 'ok' || status === 'pass' ? 'green' : status === 'fail' || status === 'error' ? 'red' : status === 'warn' || status === 'warning' ? 'amber' : '');
const StatusIcon = ({status}) => (tone(status) === 'green' ? <CheckCircle2 size={18} className="fa-ok"/> : tone(status) === 'red' ? <XCircle size={18} className="fa-bad"/> : <AlertTriangle size={18} className="fa-warn"/>);

export function Health() {
  const [{data, error}] = useLoad('/api/staff/health');
  if (error) return <Failed error={error}/>;
  if (!data) return <Loading/>;
  const cron = data.cron?.configured ? (data.cron.lastRun ? {status: 'ok', detail: `Last ran ${fmtDateTime(data.cron.lastRun.at)} and published ${data.cron.lastRun.promoted} item(s).`} : {status: 'warn', detail: 'Configured but has not run yet.'}) : {status: 'warn', detail: 'Not configured. Due items still go live when the site is visited.'};
  const rows = [
    {icon: Database, label: 'Database', status: data.database?.status ?? 'warn', detail: data.database?.detail ?? 'Unavailable.'},
    {icon: HardDrive, label: 'Media storage', status: data.media?.status ?? 'warn', detail: data.media?.detail ?? 'Unavailable.'},
    {icon: TimerReset, label: 'Scheduled publishing', ...cron},
    {icon: AlertTriangle, label: 'Recorded errors (24 hours)', status: data.recentErrors ? 'warn' : data.recentErrors === 0 ? 'ok' : 'warn', detail: data.recentErrors == null ? 'Unavailable.' : String(data.recentErrors)},
    {icon: HardDrive, label: 'Upload failures (24 hours)', status: data.uploadFailures ? 'warn' : data.uploadFailures === 0 ? 'ok' : 'warn', detail: data.uploadFailures == null ? 'Unavailable.' : String(data.uploadFailures)},
    {icon: ShieldCheck, label: 'Backups', status: data.backup?.status ?? 'warn', detail: data.backup?.detail ?? 'Unavailable.'}
  ];
  return <div className="fa-page fa-narrow">
    <PageHeader title="System health" subtitle="Live checks of the services the studio depends on."/>
    <Card><ul className="fa-checklist">{rows.map(row => <li key={row.label}><span className="fa-check-icon"><row.icon size={18} aria-hidden="true"/></span><div><strong>{row.label}</strong><small>{row.detail}</small></div><StatusIcon status={row.status}/></li>)}</ul></Card>
  </div>;
}

export function Settings() {
  const [{data, error}] = useLoad('/api/staff/settings');
  if (error) return <Failed error={error}/>;
  if (!data) return <Loading/>;
  const facts = [['Environment', data.appEnv], ['Public website', data.publicSiteUrl], ['Media storage', data.mediaConfigured ? 'Configured' : 'Not configured'], ['Secure cookies', data.cookieSecure ? 'On' : 'Off'], ['Scheduled publishing endpoint', data.cronConfigured ? 'Configured' : 'Not configured']];
  return <div className="fa-page fa-narrow">
    <PageHeader title="Settings" subtitle="Read-only deployment settings. Secrets are never shown."/>
    <Card><CardHeader title="Deployment checks" subtitle="What needs attention before this site can go live."/><ul className="fa-checklist">{(data.checks ?? []).map(check => <li key={check.id}><span className="fa-check-icon"><StatusIcon status={check.status}/></span><div><strong>{check.label}</strong><small>{check.detail}</small></div><Chip tone={tone(check.status)}>{check.status}</Chip></li>)}</ul></Card>
    <Card><CardHeader title="Configuration"/><dl className="fa-facts">{facts.map(([label, value]) => <React.Fragment key={label}><dt>{label}</dt><dd>{value || 'Not set'}</dd></React.Fragment>)}</dl></Card>
  </div>;
}
