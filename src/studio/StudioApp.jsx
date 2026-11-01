import React, {useEffect, useState} from 'react';
import {allows} from '../../server/permissions.js';
import {api} from './api.js';
import ContentEditor from './editor/ContentEditor.jsx';
import ContentList from './ContentList.jsx';
import Dashboard from './Dashboard.jsx';
import Login from './Login.jsx';
import MediaLibrary from './MediaLibrary.jsx';
import Submissions from './Submissions.jsx';
import Terms from './Terms.jsx';
import SiteEditor from './site/SiteEditor.jsx';
import Legacy from './Legacy.jsx';
import {Account, Activity, Health, Settings, Users} from './Admin.jsx';
import AppShell from './shell/AppShell.jsx';
import {FeedbackProvider} from './ui/index.jsx';
import {confirmLeave, setUnsaved} from './unsaved.js';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import './studio.css';

const denied = what => <p className="studio-alert" role="alert">You do not have permission to {what}.</p>;

export default function StudioApp() {
  const [session, setSession] = useState(undefined);
  const [hash, setHash] = useState(() => window.location.hash.slice(1) || '/');
  useEffect(() => {api('/api/staff/session').then(data => setSession(data)).catch(() => setSession({user: null, configured: false, error: 'The staff service is not available.'}));}, []);
  useEffect(() => {
    let current = window.location.hash.slice(1) || '/';
    const onHash = () => {
      const next = window.location.hash.slice(1) || '/';
      if (next === current) return;
      if (!confirmLeave()) {window.location.hash = current; return;}
      setUnsaved(false); current = next; setHash(next);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {document.title = 'Studio — Foreign Africa';}, []);
  if (session === undefined) return <main className="fa-app fa-login"><p>Loading studio…</p></main>;
  if (!session.user) return <Login notice={session.error || (session.configured === false ? 'The staff database is not configured on this server.' : '')} onSuccess={user => setSession({user, configured: true})}/>;
  const [area, type, id] = hash.split('/').filter(Boolean);
  let screen = <Dashboard user={session.user}/>;
  if (area === 'content' && type && id) screen = <ContentEditor type={type} id={id} user={session.user}/>;
  else if (area === 'content' && type) screen = <ContentList key={type} type={type} user={session.user}/>;
  else if (area === 'submissions') screen = allows(session.user.roles, 'submissions.read') ? <Submissions user={session.user} api={api} id={type}/> : <p className="studio-alert" role="alert">You do not have permission to view submissions.</p>;
  else if (area === 'legacy') screen = allows(session.user.roles, 'legacy.edit') ? <Legacy section={type} id={id} editable={Boolean(session.legacyFileEditing)}/> : <p className="studio-alert" role="alert">You do not have permission to edit these collections.</p>;
  else if (area === 'site') screen = allows(session.user.roles, 'homepage.edit') && ['hero', 'homepage'].includes(type) ? <SiteEditor key={type} area={type} user={session.user}/> : <p className="studio-alert" role="alert">You do not have permission to edit the homepage.</p>;
  else if (area === 'terms') screen = allows(session.user.roles, 'terms.manage') ? <Terms user={session.user}/> : <p className="studio-alert" role="alert">You do not have permission to manage categories and tags.</p>;
  else if (area === 'media') screen = allows(session.user.roles, 'content.read') ? <MediaLibrary user={session.user}/> : <p className="studio-alert" role="alert">You do not have permission to view the media library.</p>;
  else if (area === 'users') screen = allows(session.user.roles, 'users.read') ? <Users user={session.user}/> : <p className="studio-alert" role="alert">You do not have permission to view users.</p>;
  else if (area === 'activity') screen = allows(session.user.roles, 'activity.read') ? <Activity/> : denied('view activity');
  else if (area === 'health') screen = allows(session.user.roles, 'health.read') ? <Health/> : denied('view system health');
  else if (area === 'settings') screen = allows(session.user.roles, 'settings.read') ? <Settings/> : denied('view settings');
  else if (area === 'account') screen = <Account user={session.user}/>;
  const modern = ['content', 'media', 'users', 'activity', 'health', 'settings', 'account'].includes(area) || !area;
  return <FeedbackProvider><AppShell user={session.user} hash={hash} onLogout={async () => {await api('/api/staff/logout', {method: 'POST', body: {}}); setSession({user: null, configured: true});}}>{modern ? screen : <div className="fa-page fa-legacy">{screen}</div>}</AppShell></FeedbackProvider>;
}
