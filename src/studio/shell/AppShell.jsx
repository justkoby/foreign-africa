import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Activity, BookOpen, Briefcase, CalendarDays, ChevronDown, ChevronRight, ClipboardList, FileText, GalleryHorizontal, Handshake, HeartPulse, House, Image as ImageIcon, Inbox, Layers, LayoutDashboard, LogOut, Megaphone, Menu as MenuIcon, Newspaper, PanelLeftClose, PanelLeftOpen, PenLine, Plus, Route, Search, Settings, Sparkles, Tags, UserRound, Users, UsersRound} from 'lucide-react';
import {allows} from '../../../server/permissions.js';
import {api} from '../api.js';
import {Avatar, Button, Chip, IconButton, Menu, MenuHeading, MenuItem, MenuSeparator, StatusChip} from '../ui/index.jsx';

const typeLabel = {news: 'News', commentary: 'Commentary', page: 'Page', programme: 'Programme'};

// One place that defines the sidebar. Items only appear for roles that may use them.
export function navigation(user) {
  const can = permission => allows(user.roles, permission);
  const groups = [
    {group: 'Overview', items: [{id: '/', label: 'Dashboard', icon: LayoutDashboard}]},
    {group: 'Content', items: [
      {id: '/content/news', label: 'News', icon: Newspaper}, {id: '/content/commentary', label: 'Commentaries', icon: PenLine},
      {id: '/content/page', label: 'Pages', icon: FileText}, {id: '/content/programme', label: 'Programmes', icon: Layers},
      ...(can('content.read') ? [{id: '/media', label: 'Media library', icon: ImageIcon}] : []),
      ...(can('terms.manage') ? [{id: '/terms', label: 'Categories and tags', icon: Tags}] : []),
    ]},
    ...(can('homepage.edit') ? [{group: 'Foreign Africa', items: [{id: '/site/hero', label: 'Hero slider', icon: GalleryHorizontal}, {id: '/site/homepage', label: 'Homepage sections', icon: House}]}] : []),
    ...(can('legacy.edit') ? [{group: 'Site content', items: [{id: '/legacy/events', label: 'Events', icon: CalendarDays}, {id: '/legacy/people', label: 'People', icon: Users}, {id: '/legacy/engage', label: 'Engage pages', icon: Megaphone}]}] : []),
    ...(can('submissions.read') || can('legacy.edit') ? [{group: 'Engagement', items: [...(can('submissions.read') ? [{id: '/submissions', label: 'Submissions', icon: Inbox}] : []), ...(can('legacy.edit') ? [{id: '/legacy/forms', label: 'Form definitions', icon: ClipboardList}] : [])]}] : []),
    {group: 'Administration', items: [
      ...(can('users.read') ? [{id: '/users', label: 'Users', icon: UsersRound}] : []), ...(can('activity.read') ? [{id: '/activity', label: 'Activity', icon: Activity}] : []),
      ...(can('health.read') ? [{id: '/health', label: 'System health', icon: HeartPulse}] : []), ...(can('settings.read') ? [{id: '/settings', label: 'Settings', icon: Settings}] : []),
      {id: '/account', label: 'Your account', icon: UserRound},
    ]},
  ];
  return groups.filter(group => group.items.length);
}
// Planned modules: discoverable, but kept out of the way so they do not clutter the working navigation.
export const soon = [{label: 'Partners', icon: Handshake}, {label: 'Policy briefs', icon: BookOpen}, {label: 'Opportunities', icon: Briefcase}, {label: 'Navigation menus', icon: Route}, {label: 'Redirects', icon: Route}, {label: 'AI writing assistant', icon: Sparkles}];

export function breadcrumbs(user, hash) {
  const groups = navigation(user);
  const path = '/' + hash.split('/').filter(Boolean).join('/');
  let best = null;
  for (const group of groups) for (const item of group.items) if (item.id !== '/' && (path === item.id || path.startsWith(`${item.id}/`)) && (!best || item.id.length > best.item.id.length)) best = {group, item};
  if (!best) return path === '/' ? [{label: 'Dashboard'}] : [{label: 'Dashboard', href: '#/'}];
  const trail = [{label: 'Dashboard', href: '#/'}];
  if (best.group.group !== 'Overview') trail.push({label: best.group.group});
  const tail = path.slice(best.item.id.length).split('/').filter(Boolean);
  trail.push(tail.length ? {label: best.item.label, href: `#${best.item.id}`} : {label: best.item.label});
  if (tail.length) trail.push({label: tail[0] === 'new' ? 'New' : 'Edit'});
  return trail;
}

function Sidebar({user, hash, collapsed, onCollapse, onNavigate}) {
  const groups = useMemo(() => navigation(user), [user]);
  const active = id => hash === id || (id !== '/' && hash.startsWith(`${id}/`));
  return <aside className="fa-side" aria-label="Primary">
    <div className="fa-brand"><img src="/images/logo-navy.svg" alt=""/><span className="fa-brand-name"><strong>Foreign Africa</strong><small>Content studio</small></span>
      <IconButton className="fa-collapse-btn" icon={collapsed ? PanelLeftOpen : PanelLeftClose} label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={onCollapse}/></div>
    <nav className="fa-nav" aria-label="Main">
      {groups.map(group => <div className="fa-nav-group" key={group.group}><span className="fa-nav-label">{group.group}</span>
        {group.items.map(item => <a key={item.id} href={`#${item.id}`} className="fa-nav-item" data-tip={item.label} aria-current={active(item.id) ? 'page' : undefined} onClick={onNavigate}><item.icon aria-hidden="true"/><span className="fa-nav-text">{item.label}</span></a>)}</div>)}
      <details className="fa-soon"><summary><ChevronRight size={14} aria-hidden="true"/>Coming soon</summary>
        <div className="fa-nav-group">{soon.map(item => <span key={item.label} className="fa-nav-item is-soon" aria-disabled="true"><item.icon aria-hidden="true"/><span className="fa-nav-text">{item.label}</span><span className="fa-soon-badge">Soon</span></span>)}</div></details>
    </nav>
  </aside>;
}

// Searches real content across every type. "/" focuses it from anywhere.
function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const input = useRef(null);
  const box = useRef(null);
  useEffect(() => {
    const key = event => { if (event.key === '/' && !/input|textarea|select/i.test(event.target.tagName) && !event.target.isContentEditable) { event.preventDefault(); input.current?.focus(); } };
    const away = event => { if (!box.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('keydown', key); document.addEventListener('mousedown', away);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('mousedown', away); };
  }, []);
  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) { setResults(null); return undefined; }
    let live = true;
    const timer = setTimeout(() => api(`/api/staff/content?q=${encodeURIComponent(text)}&pageSize=6&sort=updated`).then(data => { if (live) { setResults(data.items); setSelected(0); } }).catch(() => live && setResults([])), 220);
    return () => { live = false; clearTimeout(timer); };
  }, [query]);
  const go = item => { window.location.hash = `#/content/${item.type}/${item.id}`; setOpen(false); setQuery(''); input.current?.blur(); };
  const onKey = event => {
    if (event.key === 'Escape') { setOpen(false); input.current?.blur(); }
    else if (event.key === 'ArrowDown' && results?.length) { event.preventDefault(); setSelected(value => (value + 1) % results.length); }
    else if (event.key === 'ArrowUp' && results?.length) { event.preventDefault(); setSelected(value => (value - 1 + results.length) % results.length); }
    else if (event.key === 'Enter' && results?.[selected]) { event.preventDefault(); go(results[selected]); }
  };
  return <div className="fa-gsearch" ref={box}>
    <label className="fa-search"><Search aria-hidden="true"/><span className="fa-sr">Search content</span>
      <input ref={input} type="search" role="combobox" aria-expanded={open && results != null} aria-controls="fa-search-results" value={query} placeholder="Search articles, commentaries and pages…" onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true); }} onKeyDown={onKey}/><span className="fa-kbd" aria-hidden="true">/</span></label>
    {open && results != null && <div className="fa-results" id="fa-search-results" role="listbox">
      {results.length ? results.map((item, index) => <a key={item.id} role="option" aria-selected={index === selected} className="fa-result" href={`#/content/${item.type}/${item.id}`} onClick={event => { event.preventDefault(); go(item); }}>
        <div className="fa-result-text"><strong>{item.title}</strong><small>{typeLabel[item.type] ?? item.type}{item.category ? ` · ${item.category}` : ''}</small></div><StatusChip status={item.status}/></a>)
        : <div className="fa-result"><div className="fa-result-text"><strong>No results for “{query.trim()}”</strong><small>Try a different word or check the spelling.</small></div></div>}</div>}
  </div>;
}

function NewMenu({user}) {
  if (!allows(user.roles, 'content.create')) return null;
  return <Menu label="Create" trigger={({toggle, props}) => <Button variant="primary" icon={Plus} onClick={toggle} {...props}><span className="fa-new-label">New</span></Button>}>
    <MenuHeading>Create</MenuHeading>
    <MenuItem icon={Newspaper} href="#/content/news/new">News article</MenuItem><MenuItem icon={PenLine} href="#/content/commentary/new">Commentary</MenuItem><MenuItem icon={FileText} href="#/content/page/new">Page</MenuItem>
    <MenuSeparator/><MenuItem icon={ImageIcon} href="#/media">Upload media</MenuItem>
  </Menu>;
}

function AccountMenu({user, onLogout}) {
  return <Menu label="Account" trigger={({toggle, props}) => <button type="button" className="fa-user" onClick={toggle} {...props}><Avatar name={user.name}/><span className="fa-user-text"><strong>{user.name}</strong><small>{user.role.replaceAll('_', ' ')}</small></span><ChevronDown aria-hidden="true"/></button>}>
    <MenuHeading>{user.email}</MenuHeading>
    <MenuItem icon={UserRound} href="#/account">Your account</MenuItem>
    <MenuItem icon={House} href="/" target="_blank" rel="noreferrer">View website</MenuItem>
    <MenuSeparator/><MenuItem icon={LogOut} danger onClick={onLogout}>Sign out</MenuItem>
  </Menu>;
}

export default function AppShell({user, hash, onLogout, children}) {
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('fa-side-collapsed') === '1'; } catch { return false; } });
  const [open, setOpen] = useState(false);
  const crumbs = breadcrumbs(user, hash);
  const toggleCollapse = () => setCollapsed(value => { const next = !value; try { localStorage.setItem('fa-side-collapsed', next ? '1' : '0'); } catch { /* optional */ } return next; });
  useEffect(() => { setOpen(false); }, [hash]);
  return <div className={`fa-app studio ${collapsed ? 'is-collapsed' : ''} ${open ? 'is-open' : ''}`}>
    <Sidebar user={user} hash={hash} collapsed={collapsed} onCollapse={toggleCollapse} onNavigate={() => setOpen(false)}/>
    <div className="fa-backdrop" onClick={() => setOpen(false)} aria-hidden="true"/>
    <div className="fa-col">
      <div className="fa-top">
        <IconButton className="fa-menu-btn" icon={MenuIcon} label="Open menu" onClick={() => setOpen(true)}/>
        <nav className="fa-crumbs" aria-label="Breadcrumb">{crumbs.map((crumb, index) => <React.Fragment key={index}>{index > 0 && <ChevronRight aria-hidden="true"/>}{crumb.href && index < crumbs.length - 1 ? <a href={crumb.href}>{crumb.label}</a> : <span aria-current={index === crumbs.length - 1 ? 'page' : undefined}>{crumb.label}</span>}</React.Fragment>)}</nav>
        <div className="fa-top-actions"><GlobalSearch/><NewMenu user={user}/><AccountMenu user={user} onLogout={onLogout}/></div>
      </div>
      <main className="fa-content studio-main" id="main">{children}</main>
    </div>
  </div>;
}
