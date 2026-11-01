import React, {useEffect, useState} from 'react';
import {AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, ClipboardCheck, Clock3, FileText, GalleryHorizontal, Image as ImageIcon, Inbox, Newspaper, PencilLine, PenLine, UserPen} from 'lucide-react';
import {allows} from '../../server/permissions.js';
import {api} from './api.js';
import {Avatar, Button, Card, CardHeader, Chip, EmptyState, KpiCard, Notice, PageHeader, Skeleton, StatusChip, ago, fmtDate} from './ui/index.jsx';

const typeName = {news: 'News', commentary: 'Commentary', page: 'Page', programme: 'Programme'};
const siteName = {hero: 'the hero slider', homepage: 'the homepage sections'};
const href = item => item.href ?? `#/content/${item.type}/${item.id}`;
const greeting = () => { const hour = new Date().getHours(); return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'; };

// "Ada published News: Title" style sentences, built from the real activity log.
function sentence(entry) {
  const verbs = {'content.created': 'created', 'content.updated': 'edited', 'content.published': 'published', 'content.unpublished': 'moved to draft', 'content.archived': 'archived', 'content.deleted': 'deleted', 'content.restored': 'restored an earlier version of', 'content.duplicated': 'duplicated', 'content.bulk': 'ran a bulk action on content', 'media.uploaded': 'uploaded a file to the media library', 'media.deleted': 'deleted a file', 'media.replaced': 'replaced a file', 'user.created': 'added a team member', 'user.updated': 'updated a team member', 'user.password_changed': 'changed their password', 'submission.created': 'received a form submission', 'submission.updated': 'updated a submission', 'submission.noted': 'added a note to a submission', 'submission.exported': 'exported submissions', 'term.created': 'added a category or tag', 'term.updated': 'edited a category or tag', 'term.merged': 'merged two terms', 'term.deleted': 'deleted a term'};
  let what = verbs[entry.action];
  if (entry.action.startsWith('site.')) { const area = siteName[entry.subjectId] ?? 'the site content'; what = entry.action === 'site.published' ? `published ${area}` : entry.action === 'site.draft.saved' ? `saved a draft of ${area}` : entry.action === 'site.draft.discarded' ? `discarded draft changes to ${area}` : entry.action === 'site.draft.restored' ? `restored an earlier version of ${area}` : 'changed publishing settings'; }
  if (entry.action === 'content.published' && entry.actor === 'System') what = 'went live (scheduled)';
  return {who: entry.actor, what: what ?? entry.action.replaceAll('.', ' '), title: entry.title ? `${typeName[entry.contentType] ?? 'Content'}: ${entry.title}` : ''};
}

function Attention({items}) {
  const label = {review: 'Needs review', scheduled: 'Scheduled', mine: 'Your draft', stale: 'Idle draft', submissions: 'Submissions', site: 'Unpublished'};
  const tone = {review: 'violet', scheduled: 'info', mine: '', stale: 'warning', submissions: 'info', site: 'gold'};
  const icon = {review: ClipboardCheck, scheduled: CalendarClock, mine: PencilLine, stale: Clock3, submissions: Inbox, site: GalleryHorizontal};
  if (!items.length) return <EmptyState icon={CheckCircle2} title="You're all caught up">Nothing is waiting for review, and no scheduled items or unfinished drafts need attention.</EmptyState>;
  return <ul className="fa-list">{items.map((item, index) => { const Icon = icon[item.kind]; return <li key={`${item.kind}-${item.id ?? index}`}><a className="fa-row" href={href(item)}><span className="fa-row-icon"><Icon aria-hidden="true"/></span>
    <span className="fa-row-text"><strong>{item.title}</strong><small>{item.type ? `${typeName[item.type] ?? item.type} · ` : ''}{item.kind === 'scheduled' ? `goes live ${ago(item.when)} (${fmtDate(item.when)})` : item.kind === 'site' ? (item.when ? `saved ${ago(item.when)}` : 'review and publish') : item.kind === 'submissions' ? 'open the inbox' : `edited ${ago(item.when)}`}</small></span>
    <Chip tone={tone[item.kind]}>{label[item.kind]}</Chip><ArrowRight className="fa-row-go" aria-hidden="true"/></a></li>; })}</ul>;
}

export default function Dashboard({user}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const can = permission => allows(user.roles, permission);
  useEffect(() => { api('/api/staff/overview').then(setData).catch(reason => setError(reason.message)); }, []);
  const first = user.name.split(' ')[0];
  const nextScheduled = data?.attention.find(item => item.kind === 'scheduled');
  const actions = [
    can('content.create') && {icon: Newspaper, label: 'Write a news article', href: '#/content/news/new'},
    can('content.create') && {icon: PenLine, label: 'Write a commentary', href: '#/content/commentary/new'},
    can('content.create') && {icon: FileText, label: 'Create a page', href: '#/content/page/new'},
    can('content.read') && {icon: ImageIcon, label: 'Open the media library', href: '#/media'},
    can('homepage.edit') && {icon: GalleryHorizontal, label: 'Edit the homepage', href: '#/site/homepage'},
    can('submissions.read') && {icon: Inbox, label: 'Review submissions', href: '#/submissions'},
  ].filter(Boolean);

  return <div className="fa-page">
    <PageHeader title={`${greeting()}, ${first}`} subtitle="Here is what is happening across Foreign Africa today." actions={can('content.create') && <Button variant="primary" icon={Newspaper} onClick={() => { window.location.hash = '#/content/news/new'; }}>New article</Button>}/>
    {error && <Notice tone="danger" title="The dashboard could not be loaded">{error}</Notice>}
    <div className="fa-kpis">
      {data ? <>
        <KpiCard label="Published" value={data.counts.published} note="Live on the website" icon={CheckCircle2} tone="green"/>
        <KpiCard label="Drafts" value={data.counts.draft} note={data.counts.draft ? 'Work in progress' : 'No drafts open'} icon={PencilLine}/>
        <KpiCard label="Scheduled" value={data.counts.scheduled} note={nextScheduled ? `Next goes live ${ago(nextScheduled.when)}` : 'Nothing scheduled'} icon={CalendarClock} tone="blue"/>
        <KpiCard label="Awaiting review" value={data.counts.inReview} note={data.counts.inReview ? 'Ready for an editor' : 'Nothing waiting'} icon={ClipboardCheck} tone="violet"/>
      </> : [0, 1, 2, 3].map(key => <Card key={key} className="fa-kpi"><Skeleton width={90} height={12}/><Skeleton width={70} height={30} style={{marginTop: 10}}/><Skeleton width={120} height={12}/></Card>)}
    </div>
    <div className="fa-grid-main">
      <div className="fa-stack">
        <Card><CardHeader title="Needs your attention" subtitle="Items waiting on someone, and things scheduled to happen soon" action={data && data.attention.length > 0 && <Chip>{data.attention.length}</Chip>}/>
          <div className="fa-card-body fa-flush">{data ? <Attention items={data.attention}/> : <div className="fa-card-body"><Skeleton height={44}/><Skeleton height={44} style={{marginTop: 10}}/></div>}</div></Card>
        <Card><CardHeader title="Recent publications" subtitle="The latest items live on the website" action={<Button variant="ghost" size="sm" onClick={() => { window.location.hash = '#/content/news'; }}>View all</Button>}/>
          <div className="fa-card-body fa-flush">{!data ? <div className="fa-card-body"><Skeleton height={44}/></div> : data.recent.length ? <ul className="fa-list">{data.recent.map(item => <li key={item.id}><a className="fa-row" href={href(item)}>
            {item.image ? <img className="fa-thumb is-sm" src={item.image} alt="" loading="lazy"/> : <span className="fa-thumb is-sm"><FileText aria-hidden="true"/></span>}
            <span className="fa-row-text"><strong>{item.title}</strong><small>{typeName[item.type] ?? item.type}{item.category ? ` · ${item.category}` : ''}{item.authorName ? ` · ${item.authorName}` : ''}</small></span>
            <span className="fa-row-meta"><StatusChip status={item.status}/><small>{fmtDate(item.publishedAt)}</small></span></a></li>)}</ul>
            : <EmptyState icon={Newspaper} title="Nothing published yet">Published articles and pages will appear here.</EmptyState>}</div></Card>
      </div>
      <div className="fa-stack">
        <Card><CardHeader title="Quick actions"/><div className="fa-card-body fa-actions">{actions.map(action => <a key={action.href} className="fa-action" href={action.href}><action.icon aria-hidden="true"/><span>{action.label}</span><ArrowRight aria-hidden="true"/></a>)}</div></Card>
        <Card><CardHeader title="Recent activity" subtitle="What the team has done lately"/>
          <div className="fa-card-body">{!data ? <Skeleton height={60}/> : data.activity.length ? <ol className="fa-timeline">{data.activity.map(entry => { const s = sentence(entry); return <li key={entry.id}><Avatar name={s.who} size="sm"/><div><p><strong>{s.who}</strong> {s.what}{s.title && <> <span className="fa-tl-title">{s.title}</span></>}</p><small>{ago(entry.createdAt)}</small></div></li>; })}</ol> : <EmptyState icon={UserPen} title="No activity yet">Edits, publications and uploads will be listed here.</EmptyState>}
            {can('activity.read') && data && data.activity.length > 0 && <a className="fa-more" href="#/activity">See all activity <ArrowRight aria-hidden="true"/></a>}</div></Card>
        {can('settings.read') && data && <Card><CardHeader title="System"/><div className="fa-card-body fa-stack-sm">{data.warnings.length ? data.warnings.map(w => <Notice key={w.id} tone={w.level} title={w.title} icon={AlertTriangle}>{w.detail} <a href={w.href}>Open settings</a></Notice>) : <Notice tone="success" title="Everything looks healthy">All deployment checks pass.</Notice>}</div></Card>}
      </div>
    </div>
  </div>;
}
