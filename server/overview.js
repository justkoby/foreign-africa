import {allows} from './permissions.js';
import {sqlTime} from './text.js';
import {listContent} from './content-store.js';
import {dashboard} from './store.js';
import {overview as siteOverview} from './site-store.js';
import {deploymentChecks} from './deployment-checks.js';
import {buildFreshness} from './build-stamp.js';
import {projectRoot} from './cms-service.js';

const staleDays = 14;
// Actions that are noise on a dashboard (they stay in the full Activity log).
const quiet = ['user.login', 'user.logout', 'submission.listed', 'submission.viewed', 'media.upload.failure'];

const pickItem = item => ({id: item.id, type: item.type, title: item.title, status: item.status, publishedAt: item.publishedAt, updatedAt: item.updatedAt, image: item.image, authorName: item.authorName, category: item.category});

// Everything the dashboard shows, from real data only, limited to what the signed-in user may see.
export async function buildOverview({pool, config, user, clock = () => Date.now(), shell}) {
  const can = permission => allows(user.roles, permission);
  const now = clock();
  const {content} = await dashboard(pool);
  const recent = (await listContent(pool, {includeDrafts: false, pageSize: 6, sort: 'published', clock})).items.map(pickItem);

  const attention = [];
  const [review] = await pool.execute("SELECT id, content_type, title, status, updated_at FROM content_items WHERE deleted_at IS NULL AND status IN ('in_review', 'changes_requested') ORDER BY updated_at ASC LIMIT 5");
  for (const row of review) attention.push({kind: 'review', id: Number(row.id), type: row.content_type, title: row.title, status: row.status, when: row.updated_at});
  const [scheduled] = await pool.execute("SELECT id, content_type, title, published_at FROM content_items WHERE deleted_at IS NULL AND status = 'scheduled' AND published_at IS NOT NULL ORDER BY published_at ASC LIMIT 4");
  for (const row of scheduled) attention.push({kind: 'scheduled', id: Number(row.id), type: row.content_type, title: row.title, status: 'scheduled', when: row.published_at});
  const [mine] = await pool.execute("SELECT id, content_type, title, updated_at FROM content_items WHERE deleted_at IS NULL AND status = 'draft' AND author_id = ? ORDER BY updated_at DESC LIMIT 4", [user.id]);
  for (const row of mine) attention.push({kind: 'mine', id: Number(row.id), type: row.content_type, title: row.title, status: 'draft', when: row.updated_at});
  const [stale] = await pool.execute("SELECT id, content_type, title, updated_at FROM content_items WHERE deleted_at IS NULL AND status = 'draft' AND updated_at < ? AND author_id <> ? ORDER BY updated_at ASC LIMIT 3", [sqlTime(now - staleDays * 864e5), user.id]);
  if (can('content.update.any')) for (const row of stale) attention.push({kind: 'stale', id: Number(row.id), type: row.content_type, title: row.title, status: 'draft', when: row.updated_at});
  let submissions = null;
  if (can('submissions.read')) {
    const [[row]] = await pool.execute("SELECT COUNT(*) AS n FROM submissions WHERE status = 'new'");
    submissions = {new: Number(row.n)};
    if (submissions.new) attention.push({kind: 'submissions', title: `${submissions.new} new submission${submissions.new === 1 ? '' : 's'} to review`, href: '#/submissions'});
  }
  if (can('homepage.edit')) {
    const areas = await siteOverview(pool);
    for (const [key, area] of Object.entries(areas)) if (area.hasUnpublishedChanges) attention.push({kind: 'site', title: `${area.label} has changes that are not live yet`, when: area.draftSavedAt, href: `#/site/${key}`});
  }

  const filter = can('activity.read') ? '' : " AND a.action LIKE 'content.%'";
  const [activity] = await pool.query(`SELECT a.id, a.action, a.subject_type, a.subject_id, a.created_at, u.name AS actor, c.title AS content_title, c.content_type FROM activity_logs a LEFT JOIN users u ON u.id = a.actor_id LEFT JOIN content_items c ON a.subject_type = 'content' AND a.subject_id REGEXP '^[0-9]+$' AND c.id = CAST(a.subject_id AS UNSIGNED) WHERE a.action NOT IN (${quiet.map(() => '?').join(',')})${filter} ORDER BY a.id DESC LIMIT 10`, quiet);

  const warnings = [];
  if (can('settings.read')) {
    for (const check of deploymentChecks(config, process.env, {distBuilt: Boolean(shell && shell()), distFreshness: buildFreshness(projectRoot)})) {
      if (check.status === 'fail' || check.status === 'warn') warnings.push({id: check.id, level: check.status === 'fail' ? 'danger' : 'warning', title: check.label, detail: check.detail, href: '#/settings'});
    }
  }
  return {
    counts: content, recent, attention, submissions, warnings,
    activity: activity.map(row => ({id: Number(row.id), action: row.action, actor: row.actor ?? 'System', subjectType: row.subject_type, subjectId: row.subject_id, title: row.content_title ?? '', contentType: row.content_type ?? '', createdAt: row.created_at})),
  };
}
