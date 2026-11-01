import React, {useEffect, useState} from 'react';
import {Eye, EyeOff, Menu} from 'lucide-react';
import {allows} from '../../server/permissions.js';
import {ContentEditor, ContentList} from './ArticleEditor.jsx';
import MediaLibrary from './MediaLibrary.jsx';
import '../fonts.css';
import './studio.css';

const sections = [['news', 'News'], ['commentary', 'Commentaries'], ['page', 'Pages'], ['programme', 'Programmes']];
const later = [['Content', ['Events', 'Publications']], ['Organization', ['Team', 'Partners']], ['Engagement', ['Opportunities', 'Forms', 'Submissions']], ['Website', ['Homepage', 'Navigation', 'Redirects']]];

async function api(path, options = {}) {
  const response = await fetch(path, {credentials: 'same-origin', headers: {'Content-Type': 'application/json'}, ...options, body: options.body === undefined ? undefined : JSON.stringify(options.body)});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The request failed.');
  return data;
}

function LoginScreen({onSuccess, notice}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  return <main className="studio-login"><p className="studio-chip"><img src="/images/logo-navy.svg" alt=""/>foreignafrica.org</p><div className="studio-frame"><div className="studio-art" aria-hidden="true"><span className="orb orb-stripe"/><span className="orb orb-blue"/><span className="orb orb-gold"/><span className="bloom"/></div><form onSubmit={async event => {event.preventDefault(); setError(''); try {const data = await api('/api/staff/login', {method: 'POST', body: {email, password}}); onSuccess(data.user);} catch (reason) {setError(reason.message);}}}><div className="studio-brand"><img src="/images/logo-navy.svg" alt=""/>Foreign Africa</div><h1>Welcome Back!</h1><p>Enter your details below</p>{notice && <p className="studio-alert" role="status">{notice}</p>}<label>Email<input type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)}/></label><label>Password<span><input type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)}/><button type="button" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(value => !value)}>{show ? <EyeOff size={18}/> : <Eye size={18}/>}</button></span></label>{error && <p className="studio-alert" role="alert">{error}</p>}<button className="studio-submit" type="submit">Log in</button><p className="studio-note">Staff accounts only. News and commentaries publish from this studio. Other sections stay in /editor.</p></form></div></main>;
}

function Shell({user, hash, setHash, children, onLogout}) {
  const [open, setOpen] = useState(false);
  const go = next => {window.location.hash = next; setHash(next); setOpen(false);};
  const link = (id, label) => <a href={`#${id}`} aria-current={hash === id || hash.startsWith(`${id}/`) ? 'page' : undefined} onClick={() => setOpen(false)}>{label}</a>;
  return <div className="studio"><aside className={open ? 'is-open' : ''}><strong>Foreign Africa</strong><p>Content studio</p><nav><span>Overview</span>{link('/', 'Dashboard')}<span>Content</span>{sections.map(([id, label]) => link(`/content/${id}`, label))}{allows(user.roles, 'content.read') && link('/media', 'Media library')}{later.map(([group, items]) => <div key={group}><span>{group}</span>{items.map(item => <span className="studio-later" key={item}>{item}<small>Not in this release</small></span>)}</div>)}<span>Administration</span>{allows(user.roles, 'users.read') && link('/users', 'Users')}{allows(user.roles, 'activity.read') && link('/activity', 'Activity')}{allows(user.roles, 'health.read') && link('/health', 'System health')}{allows(user.roles, 'settings.read') && link('/settings', 'Settings')}{link('/account', 'Your account')}</nav><button type="button" onClick={onLogout}>Log out</button></aside><div className="studio-main"><header><button type="button" className="studio-menu" aria-label="Open menu" onClick={() => setOpen(value => !value)}><Menu size={20}/></button><span>{user.name}</span><em>{user.role.replaceAll('_', ' ')}</em></header>{children}</div></div>;
}

function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {api('/api/staff/dashboard').then(setData).catch(reason => setError(reason.message));}, []);
  if (error) return <p className="studio-alert" role="alert">{error}</p>;
  if (!data) return <p>Loading dashboard…</p>;
  return <><h1>Dashboard</h1><div className="studio-cards"><article><strong>{data.content.published}</strong>Published</article><article><strong>{data.content.draft}</strong>Drafts</article><article><strong>{data.content.scheduled}</strong>Scheduled</article><article><strong>{data.content.inReview}</strong>In review</article></div><section><h2>Recent activity</h2>{data.recentActivity.length ? <ul>{data.recentActivity.map(item => <li key={item.id}>{item.action.replaceAll('.', ' ')}</li>)}</ul> : <p>No activity yet.</p>}</section><section><h2>System</h2><p>Database: {data.health.database}. Media: {data.health.media.detail}</p><p>{data.health.backup.detail}</p><p>Published news and commentaries appear on the public site. Events, people, and forms are still edited at <a href="/editor">/editor</a>.</p></section></>;
}

function Users() {
  const [users, setUsers] = useState(null);
  const [form, setForm] = useState({name: '', email: '', role: 'editor', password: ''});
  const [error, setError] = useState('');
  const load = () => api('/api/staff/users').then(data => setUsers(data.users)).catch(reason => setError(reason.message));
  useEffect(() => {load();}, []);
  return <><h1>Users</h1>{error && <p className="studio-alert" role="alert">{error}</p>}<ul>{users?.map(person => <li key={person.id}>{person.name} · {person.email} · {person.role.replaceAll('_', ' ')} · {person.status} <button type="button" onClick={async () => {await api(`/api/staff/users/${person.id}`, {method: 'PATCH', body: {status: person.status === 'active' ? 'disabled' : 'active'}}); load();}}>{person.status === 'active' ? 'Disable' : 'Enable'}</button></li>)}</ul><h2>Add a staff account</h2><form onSubmit={async event => {event.preventDefault(); setError(''); try {await api('/api/staff/users', {method: 'POST', body: form}); setForm({name: '', email: '', role: 'editor', password: ''}); load();} catch (reason) {setError(reason.message);}}}><label>Name<input value={form.name} onChange={event => setForm({...form, name: event.target.value})}/></label><label>Email<input type="email" value={form.email} onChange={event => setForm({...form, email: event.target.value})}/></label><label>Role<select value={form.role} onChange={event => setForm({...form, role: event.target.value})}><option value="admin">Administrator</option><option value="editor">Editor</option><option value="contributor">Contributor</option><option value="super_admin">Super Administrator</option></select></label><label>Temporary password<input type="password" value={form.password} onChange={event => setForm({...form, password: event.target.value})}/></label><button type="submit">Create account</button></form></>;
}

function Account({user}) {
  const [form, setForm] = useState({currentPassword: '', newPassword: ''});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  return <><h1>Your account</h1><p>{user.name}<br/>{user.email}</p><form onSubmit={async event => {event.preventDefault(); setError(''); setMessage(''); try {await api('/api/staff/me/password', {method: 'POST', body: form}); setForm({currentPassword: '', newPassword: ''}); setMessage('Password changed.');} catch (reason) {setError(reason.message);}}}><label>Current password<input type="password" value={form.currentPassword} onChange={event => setForm({...form, currentPassword: event.target.value})}/></label><label>New password<input type="password" value={form.newPassword} onChange={event => setForm({...form, newPassword: event.target.value})}/></label>{error && <p className="studio-alert" role="alert">{error}</p>}{message && <p role="status">{message}</p>}<button type="submit">Change password</button></form><p>Password reset by email is not available. An administrator can set a new password with you.</p></>;
}

function Plain({title, path, render}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {api(path).then(setData).catch(reason => setError(reason.message));}, [path]);
  if (error) return <p className="studio-alert" role="alert">{error}</p>;
  if (!data) return <p>Loading…</p>;
  return <><h1>{title}</h1>{render(data)}</>;
}

export default function StudioApp() {
  const [session, setSession] = useState(undefined);
  const [hash, setHash] = useState(() => window.location.hash.slice(1) || '/');
  useEffect(() => {api('/api/staff/session').then(data => setSession(data)).catch(() => setSession({user: null, configured: false, error: 'The staff service is not available.'}));}, []);
  useEffect(() => {const onHash = () => setHash(window.location.hash.slice(1) || '/'); window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash);}, []);
  useEffect(() => {document.title = 'Studio — Foreign Africa';}, []);
  if (session === undefined) return <main className="studio-login"><p>Loading studio…</p></main>;
  if (!session.user) return <LoginScreen notice={session.error || (session.configured === false ? 'The staff database is not configured on this server.' : '')} onSuccess={user => setSession({user, configured: true})}/>;
  const [area, type, id] = hash.split('/').filter(Boolean);
  let screen = <Dashboard/>;
  if (area === 'content' && type && id) screen = <ContentEditor type={type} id={id} user={session.user}/>;
  else if (area === 'content' && type) screen = <ContentList type={type} label={sections.find(item => item[0] === type)?.[1] ?? 'Content'} user={session.user}/>;
  else if (area === 'media') screen = allows(session.user.roles, 'content.read') ? <MediaLibrary/> : <p className="studio-alert" role="alert">You do not have permission to view the media library.</p>;
  else if (area === 'users') screen = allows(session.user.roles, 'users.read') ? <Users/> : <p className="studio-alert" role="alert">You do not have permission to view users.</p>;
  else if (area === 'activity') screen = <Plain title="Activity" path="/api/staff/activity" render={data => data.activity.length ? <ul>{data.activity.map(item => <li key={item.id}>{item.action}</li>)}</ul> : <p>No activity yet.</p>}/>;
  else if (area === 'health') screen = <Plain title="System health" path="/api/staff/health" render={data => <ul><li>Database: {data.database.detail}</li><li>Media: {data.media.detail}</li><li>Recorded errors in the last day: {data.recentErrors ?? 'unavailable'}</li><li>Upload failures in the last day: {data.uploadFailures ?? 'unavailable'}</li><li>{data.backup.detail}</li></ul>}/>;
  else if (area === 'settings') screen = <Plain title="Settings" path="/api/staff/settings" render={data => <ul><li>Environment: {data.appEnv}</li><li>Public URL: {data.publicSiteUrl}</li><li>Media storage: {data.mediaConfigured ? 'configured' : 'not configured'}</li><li>Secure cookies: {data.cookieSecure ? 'on' : 'off'}</li></ul>}/>;
  else if (area === 'account') screen = <Account user={session.user}/>;
  return <Shell user={session.user} hash={hash} setHash={setHash} onLogout={async () => {await api('/api/staff/logout', {method: 'POST', body: {}}); setSession({user: null, configured: true});}}>{screen}</Shell>;
}
