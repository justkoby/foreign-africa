import express from 'express';
import {existsSync, readFileSync} from 'node:fs';
import {access, constants} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {allows} from './permissions.js';
import {externalRedirect, renderContentPage, robotsText, sitemapXml} from './html.js';
import {readCookie, sameSecret, originAllowed, sqlTime} from './text.js';
import {getMedia, listMedia, mediaRootProblem, storageMarker, mediaUsage, openMedia, readUpload, removeMedia, replaceUpload, saveUpload, updateMedia} from './media.js';
import {createHandler as createDiscoverHandler} from '../api/discover.js';
import {createHandler as createCmsHandler} from '../api/cms.js';
import {createCms, projectRoot} from './cms-service.js';
import {deploymentChecks} from './deployment-checks.js';
import {buildFreshness} from './build-stamp.js';
import {createTerm, deleteTerm, listTerms, updateTerm} from './terms-store.js';
import * as siteStore from './site-store.js';
import {injectSiteData} from './site-inject.js';
import {addNote, exportCsv, getSubmission, listSubmissions, recordSubmission, updateSubmission} from './submissions.js';
import * as store from './store.js';

const cookieName = 'fa_staff';

function send(res, status, body) {
  res.status(status).json(body);
}

function cookie(token, config, maxAge) {
  const parts = [`${cookieName}=${encodeURIComponent(token)}`, 'HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${maxAge}`];
  if (config.cookieSecure) parts.push('Secure');
  return parts.join('; ');
}

async function storageCheck(config) {
  const blocked = mediaRootProblem(config.mediaRoot);
  if (blocked) return {status: config.mediaRoot ? 'failed' : 'not_configured', detail: blocked};
  if (!existsSync(config.mediaRoot)) return {status: 'failed', detail: 'The media directory does not exist.'};
  try {
    await access(config.mediaRoot, constants.W_OK);
    try {
      const marker = await storageMarker(config.mediaRoot);
      return {status: 'ok', detail: marker.survivedRestart ? `The media directory is writable and survived a restart (marker from ${marker.createdAt}). Uploads persist.` : `The media directory is writable. Persistence is not yet proven: a marker was written ${marker.createdAt}. Redeploy once, then check this page again; it should say the folder survived a restart.`, persistence: marker.survivedRestart ? 'verified' : 'unverified'};
    } catch {
      return {status: 'ok', detail: 'The media directory is writable.', persistence: 'unverified'};
    }
  } catch {
    return {status: 'failed', detail: 'The media directory is not writable.'};
  }
}

function acmeChallenge(token) {
  if (!/^[A-Za-z0-9_-]{8,}$/.test(token)) return '';
  const roots = [];
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    roots.push(dir, join(dir, 'public_html'));
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  for (const root of roots) {
    const file = join(root, '.well-known', 'acme-challenge', token);
    if (existsSync(file)) return readFileSync(file);
  }
  return '';
}

export function createApp({config, pool, clock = () => Date.now(), forms, shell}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({limit: '1mb'}));

  // Anything that is not production must never be indexed, even its error and sign-in responses.
  if (config.appEnv !== 'production') app.use((req, res, next) => { res.setHeader('X-Robots-Tag', 'noindex, nofollow'); next(); });

  app.get('/.well-known/acme-challenge/:token', (req, res) => {
    const body = acmeChallenge(req.params.token);
    if (!body) return send(res, 404, {error: 'Not found.'});
    res.type('text/plain').send(body);
  });

  app.use((req, res, next) => {
    if (config.appEnv !== 'staging') return next();
    if (req.path.startsWith('/.well-known/acme-challenge/')) return next();
    // The scheduler authenticates with its own secret token; it cannot also send the staging Basic password.
    if (req.path === '/api/cron/publish') return next();
    // Health reveals only whether the app and database are up, so it can be checked without the password.
    if (req.path === '/api/health') return next();
    if (!config.stagingUser || !config.stagingPassword) return send(res, 503, {error: 'Staging access is not configured.'});
    const header = String(req.headers.authorization || '');
    const encoded = header.startsWith('Basic ') ? header.slice(6) : '';
    const decoded = encoded ? Buffer.from(encoded, 'base64').toString('utf8') : '';
    const split = decoded.indexOf(':');
    const user = split >= 0 ? decoded.slice(0, split) : '';
    const password = split >= 0 ? decoded.slice(split + 1) : '';
    if (!sameSecret(user, config.stagingUser) || !sameSecret(password, config.stagingPassword)) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Foreign Africa staging"');
      return send(res, 401, {error: 'Staging sign-in is required.'});
    }
    next();
  });

  const discover = createDiscoverHandler();
  app.post('/api/discover', (req, res, next) => { Promise.resolve(discover(req, res)).catch(next); });
  const route = handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);

  async function actor(req) {
    if (!pool || !config.sessionSecret) return null;
    return store.userFromToken(pool, config, clock, readCookie(req.headers.cookie, cookieName));
  }

  function requireUser(permission) {
    return async req => {
      const user = await actor(req);
      if (!user) throw store.fail(401, 'Sign in is required.');
      if (permission && !allows(user.roles, permission)) throw store.fail(403, 'You do not have permission to do that.');
      return user;
    };
  }

  function requireDatabase(req, res) {
    if (!pool) {
      send(res, 503, {error: 'The staff database is not configured.'});
      return false;
    }
    if (!config.sessionSecret) {
      send(res, 503, {error: 'SESSION_SECRET is not configured.'});
      return false;
    }
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !originAllowed(req.headers.origin, config, req.headers.host)) {
      send(res, 403, {error: 'This request was rejected.'});
      return false;
    }
    return true;
  }

  const legacyForms = createCms({env: {}});
  const submitBuckets = new Map();

  // Public form submission: validated on the server, stored privately in MySQL, never written to the deploy tree.
  app.post('/api/cms/submit', route(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!pool || !config.sessionSecret) return send(res, 503, {error: 'The enquiry could not be saved.'});
    if (!originAllowed(req.headers.origin, config, req.headers.host)) return send(res, 403, {error: 'This request was rejected.'});
    const now = clock();
    for (const [key, value] of submitBuckets) if (now - value.start >= 60000) submitBuckets.delete(key);
    const bucket = submitBuckets.get(req.ip) ?? {start: now, count: 0};
    if (bucket.count >= 10 || (!submitBuckets.has(req.ip) && submitBuckets.size >= 5000)) { res.setHeader('Retry-After', '60'); return send(res, 429, {error: 'Wait a minute, then try again.'}); }
    bucket.count += 1; submitBuckets.set(req.ip, bucket);
    const form = ((forms ? forms() : legacyForms.list('forms')) ?? []).find(item => item.id === req.body?.formId && item.status === 'publish');
    if (!form) return send(res, 404, {error: 'This form is not open.'});
    try {
      const result = await recordSubmission({pool, clock, secret: config.sessionSecret, form, answers: req.body?.answers, key: typeof req.body?.key === 'string' ? req.body.key.slice(0, 100) : '', ip: req.ip});
      send(res, 200, {ok: true, reference: result.reference, success: result.success});
    } catch (error) {
      if (error.errors) return send(res, 400, {error: error.message, errors: error.errors});
      throw error;
    }
  }));

  // Everything else under /api/cms (the file collections) needs a Studio session and the legacy.edit permission.
  const cms = createCmsHandler({
    allowWrites: config.legacyFileEditing,
    authorize: async req => {
      if (!pool || !config.sessionSecret) return 401;
      let user;
      try { user = await actor(req); } catch { return 401; }
      if (!user) return 401;
      if (!allows(user.roles, 'legacy.edit')) return 403;
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !originAllowed(req.headers.origin, config, req.headers.host)) return 403;
      return 200;
    },
  });
  app.use('/api/cms', (req, res, next) => {
    if (!req.url.startsWith('/api/cms')) req.url = `/api/cms${req.url.startsWith('/') ? req.url : `/${req.url}`}`;
    Promise.resolve(cms(req, res)).catch(next);
  });

  // Scheduled publishing trigger for an external cron. Safe to call repeatedly or concurrently: promotion is atomic
  // and idempotent, so a replayed or duplicated request changes nothing.
  const cronBuckets = new Map();
  const cronFailures = new Map();
  const within = (map, key, max, windowMs) => {
    const now = clock();
    for (const [name, value] of map) if (now - value.start >= windowMs) map.delete(name);
    const entry = map.get(key) ?? {start: now, count: 0};
    entry.count += 1; map.set(key, entry);
    return entry.count <= max && map.size <= 5000;
  };
  app.all('/api/cron/publish', route(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!config.cronSecret) return send(res, 404, {error: 'Not found.'});
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, {error: 'Use POST.'}); }
    if ((config.appEnv === 'staging' || config.appEnv === 'production') && !req.secure) return send(res, 400, {error: 'HTTPS is required.'});
    if (!within(cronBuckets, req.ip, 30, 60000)) { res.setHeader('Retry-After', '60'); return send(res, 429, {error: 'Too many requests.'}); }
    const header = String(req.headers.authorization || '');
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token || !sameSecret(token, config.cronSecret)) {
      if (!within(cronFailures, req.ip, 5, 15 * 60000)) { res.setHeader('Retry-After', '900'); return send(res, 429, {error: 'Too many requests.'}); }
      console.warn('cron publish: rejected an unauthenticated request');
      return send(res, 401, {error: 'Unauthorized.'});
    }
    if (!pool) return send(res, 503, {error: 'The database is not configured.'});
    try {
      const promoted = await store.promoteScheduled(pool, clock);
      const at = new Date(clock()).toISOString();
      await pool.execute("INSERT INTO settings (setting_key, setting_value) VALUES ('cron_last_run', ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)", [JSON.stringify({at, promoted})]);
      send(res, 200, {ok: true, promoted, at});
    } catch (error) {
      console.error(`cron publish failed: ${error.code || error.name}`);
      await pool.execute("INSERT INTO activity_logs (actor_id, action, subject_type, subject_id, metadata, created_at) VALUES (NULL, 'system.error', 'cron', '', ?, ?)", [JSON.stringify({source: 'cron.publish', code: String(error.code || error.name)}), sqlTime(clock())]).catch(() => {});
      send(res, 500, {error: 'The run failed.'});
    }
  }));

  app.get('/robots.txt', (req, res) => {
    res.type('text/plain').send(robotsText(config));
  });

  app.get('/sitemap.xml', route(async (req, res) => {
    if (config.appEnv !== 'production') return send(res, 404, {error: 'Not found.'});
    if (!pool) return send(res, 503, {error: 'The staff database is not configured.'});
    const listed = await store.listContent(pool, {includeDrafts: false, pageSize: 100, sort: 'published', clock});
    res.type('application/xml').send(sitemapXml(config, listed.items.map(item => ({...item, content_type: item.type}))));
  }));

  app.get('/api/health', route(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!pool) return send(res, 503, {ok: false, phase: 'running', database: 'not_configured'});
    try {
      await store.databaseReachable(pool);
      send(res, 200, {ok: true, phase: 'running', database: 'ok'});
    } catch (error) {
      // The error code only (never the driver's message, which can name the user and host).
      send(res, 503, {ok: false, phase: 'running', database: 'unreachable', code: String(error.code || error.name || 'unknown')});
    }
  }));

  app.get('/api/public/content', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    await store.promoteDue(pool, clock);
    const listed = await store.listContent(pool, {type: req.query.type, q: req.query.q, includeDrafts: false, page: req.query.page, pageSize: req.query.pageSize, sort: 'published', clock});
    send(res, 200, {...listed, items: listed.items.map(store.publicView)});
  }));

  app.get('/api/public/content/:type/:slug', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    const item = await store.publicItem(pool, req.params.type, req.params.slug, clock);
    if (!item) return send(res, 404, {error: 'Not found.'});
    const redirect = externalRedirect(item);
    if (redirect && req.query.format === 'html') return res.redirect(302, redirect);
    if (req.query.format === 'html') return res.type('html').send(renderContentPage(config, item));
    send(res, 200, {item: store.publicView(item)});
  }));

  app.get(['/media/:id', '/media/:id/thumb'], route(async (req, res) => {
    if (!pool || !/^\d+$/.test(req.params.id)) return send(res, 404, {error: 'Not found.'});
    const opened = await openMedia(pool, config, Number(req.params.id), req.path.endsWith('/thumb'));
    if (!opened) return send(res, 404, {error: 'Not found.'});
    if (opened.redirect) return res.redirect(302, opened.redirect);
    // Each stored file has a unique name, so its name is a perfect ETag. Revalidating (instead of caching for a year)
    // means a replaced image shows up for everyone within minutes while unchanged files still return 304.
    res.setHeader('ETag', opened.etag);
    res.setHeader('Cache-Control', 'public, max-age=600, must-revalidate');
    if (req.headers['if-none-match'] === opened.etag) { opened.stream.destroy(); return res.status(304).end(); }
    res.setHeader('Content-Type', opened.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    opened.stream.pipe(res);
  }));

  app.post('/api/staff/login', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    const result = await store.login({pool, config, clock, email: req.body?.email, password: req.body?.password, ip: req.ip, userAgent: req.headers['user-agent']});
    res.setHeader('Set-Cookie', cookie(result.token, config, 60 * 60 * 24 * 7));
    send(res, 200, {user: result.user});
  }));

  app.post('/api/staff/logout', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    const user = await actor(req);
    await store.revokeToken(pool, config, clock, readCookie(req.headers.cookie, cookieName), user?.id);
    res.setHeader('Set-Cookie', cookie('', config, 0));
    send(res, 200, {ok: true});
  }));

  app.get('/api/staff/session', route(async (req, res) => {
    if (!pool || !config.sessionSecret) return send(res, 200, {user: null, configured: false});
    try {
      send(res, 200, {user: await actor(req), configured: true, legacyFileEditing: Boolean(config.legacyFileEditing)});
    } catch {
      send(res, 200, {user: null, configured: true, error: 'The staff database is not reachable.'});
    }
  }));

  app.get('/api/staff/dashboard', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    await requireUser('content.read')(req);
    await store.promoteDue(pool, clock);
    const counts = await store.dashboard(pool);
    let database = 'ok';
    try { await store.databaseReachable(pool); } catch { database = 'failed'; }
    send(res, 200, {...counts, health: {database, media: await storageCheck(config), backup: {status: 'unknown', detail: 'Hostinger backups are managed in hPanel. This screen cannot confirm them.'}}});
  }));

  app.get('/api/staff/health', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    await requireUser('health.read')(req);
    let database = {status: 'ok', detail: 'The database answered.'};
    let recentErrors = null;
    try {
      await store.databaseReachable(pool);
      const since = sqlTime(clock() - 24 * 60 * 60 * 1000);
      const [errors] = await pool.execute("SELECT COUNT(*) AS n FROM activity_logs WHERE action = 'system.error' AND created_at > ?", [since]);
      const [uploads] = await pool.execute("SELECT COUNT(*) AS n FROM activity_logs WHERE action = 'media.upload.failure' AND created_at > ?", [since]);
      recentErrors = Number(errors[0].n);
      var uploadFailures = Number(uploads[0].n);
    } catch {
      database = {status: 'failed', detail: 'The database is not reachable.'};
    }
    let cron = {configured: Boolean(config.cronSecret), lastRun: null};
    try {
      const [runs] = await pool.execute("SELECT setting_value FROM settings WHERE setting_key = 'cron_last_run'");
      if (runs[0]) cron.lastRun = JSON.parse(runs[0].setting_value);
    } catch { /* health must not fail because of this */ }
    send(res, 200, {database, media: await storageCheck(config), cron, recentErrors, uploadFailures: uploadFailures ?? null, backup: {status: 'unknown', detail: 'Hostinger backups are managed in hPanel. This screen cannot confirm them.'}});
  }));

  app.get('/api/staff/settings', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    await requireUser('settings.read')(req);
    send(res, 200, {appEnv: config.appEnv, publicSiteUrl: config.publicSiteUrl, mediaConfigured: Boolean(config.mediaRoot), cookieSecure: config.cookieSecure, cronConfigured: Boolean(config.cronSecret), dbConnectionLimit: config.dbConnectionLimit, checks: deploymentChecks(config, process.env, {distBuilt: Boolean(shell && shell()), distFreshness: buildFreshness(projectRoot)})});
  }));

  app.get('/api/staff/users', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    await requireUser('users.read')(req);
    send(res, 200, {users: await store.listUsers(pool)});
  }));

  app.post('/api/staff/users', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    const user = await requireUser('users.manage')(req);
    send(res, 201, {user: await store.createUser({pool, config, clock, actor: user, input: req.body ?? {}})});
  }));

  app.patch('/api/staff/users/:id', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    const user = await requireUser('users.manage')(req);
    send(res, 200, {user: await store.updateUser({pool, clock, actor: user, userId: Number(req.params.id), input: req.body ?? {}})});
  }));

  app.post('/api/staff/me/password', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    const user = await requireUser()(req);
    await store.changePassword({pool, config, clock, user, currentPassword: req.body?.currentPassword, newPassword: req.body?.newPassword});
    send(res, 200, {ok: true});
  }));

  app.get('/api/staff/activity', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    await requireUser('activity.read')(req);
    send(res, 200, {activity: await store.listActivity(pool)});
  }));

  app.get('/api/staff/content', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    await requireUser('content.read')(req);
    await store.promoteDue(pool, clock);
    send(res, 200, await store.listContent(pool, {type: req.query.type, status: req.query.status, q: req.query.q, includeDrafts: true, page: req.query.page, pageSize: req.query.pageSize, sort: req.query.sort, clock}));
  }));

  app.get('/api/staff/media', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    await requireUser('content.read')(req);
    send(res, 200, await listMedia(pool, {q: req.query.q, type: req.query.type, sort: req.query.sort, page: req.query.page, pageSize: req.query.pageSize}));
  }));

  app.post('/api/staff/media', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    const user = await requireUser('content.create')(req);
    try {
      const asset = await saveUpload({pool, config, clock, actor: user, upload: await readUpload(req)});
      await pool.execute('INSERT INTO activity_logs (actor_id, action, subject_type, subject_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)', [user.id, 'media.uploaded', 'media', asset.id, '{}', sqlTime(clock())]);
      send(res, 201, {asset});
    } catch (error) {
      if (error.status && error.status < 500) await pool.execute('INSERT INTO activity_logs (actor_id, action, subject_type, subject_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)', [user.id, 'media.upload.failure', 'media', '', JSON.stringify({status: error.status}), sqlTime(clock())]);
      throw error;
    }
  }));

  app.patch('/api/staff/media/:id', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    const user = await requireUser('content.read')(req);
    send(res, 200, {asset: await updateMedia({pool, clock, actor: user, canEditAny: allows(user.roles, 'content.update.any'), id: Number(req.params.id), input: req.body ?? {}})});
  }));

  app.get('/api/staff/media/:id', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    await requireUser('content.read')(req);
    send(res, 200, {asset: await getMedia(pool, Number(req.params.id)), usage: await mediaUsage(pool, Number(req.params.id))});
  }));

  app.post('/api/staff/media/:id/replace', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    const user = await requireUser('content.update.any')(req);
    const asset = await replaceUpload({pool, config, clock, id: Number(req.params.id), upload: await readUpload(req)});
    await pool.execute('INSERT INTO activity_logs (actor_id, action, subject_type, subject_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)', [user.id, 'media.replaced', 'media', req.params.id, '{}', sqlTime(clock())]);
    send(res, 200, {asset});
  }));

  app.delete('/api/staff/media/:id', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    const user = await requireUser('content.update.any')(req);
    await removeMedia({pool, config, clock, id: Number(req.params.id)});
    await pool.execute('INSERT INTO activity_logs (actor_id, action, subject_type, subject_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)', [user.id, 'media.deleted', 'media', req.params.id, '{}', sqlTime(clock())]);
    send(res, 200, {ok: true});
  }));

  app.post('/api/staff/content', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    const user = await requireUser('content.create')(req);
    send(res, 201, {item: await store.createContent({pool, clock, actor: user, input: req.body ?? {}})});
  }));

  app.post('/api/staff/content/bulk', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    const user = await requireUser('content.read')(req);
    send(res, 200, {results: await store.bulkContent({pool, clock, actor: user, action: req.body?.action, ids: req.body?.ids})});
  }));

  app.get('/api/staff/content/:id', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    await requireUser('content.read')(req);
    send(res, 200, {item: await store.getContent(pool, Number(req.params.id))});
  }));

  app.patch('/api/staff/content/:id', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    const user = await requireUser('content.read')(req);
    send(res, 200, {item: await store.updateContent({pool, clock, actor: user, id: Number(req.params.id), input: req.body ?? {}})});
  }));

  app.post('/api/staff/content/:id/state', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    const user = await requireUser('content.read')(req);
    send(res, 200, {item: await store.setContentState({pool, clock, actor: user, id: Number(req.params.id), status: req.body?.status, publishedAt: req.body?.publishedAt})});
  }));

  app.delete('/api/staff/content/:id', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    const user = await requireUser('content.read')(req);
    await store.deleteContent({pool, clock, actor: user, id: Number(req.params.id)});
    send(res, 200, {ok: true});
  }));

  app.get('/api/staff/content/:id/revisions', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    await requireUser('content.read')(req);
    send(res, 200, {revisions: await store.revisions(pool, Number(req.params.id))});
  }));

  app.get('/api/staff/content/:id/preview', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    const user = await requireUser('content.read')(req);
    const item = await store.getContent(pool, Number(req.params.id));
    if (!store.editorCanSee(user, item)) throw store.fail(403, 'You cannot preview that page.');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.type('html').send(renderContentPage({...config, appEnv: 'development'}, item));
  }));

  app.post('/api/staff/content/:id/duplicate', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    const user = await requireUser('content.create')(req);
    send(res, 201, {item: await store.duplicateContent({pool, clock, actor: user, id: Number(req.params.id)})});
  }));

  app.post('/api/staff/content/:id/restore', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    const user = await requireUser('content.read')(req);
    send(res, 200, {item: await store.restoreRevision({pool, clock, actor: user, contentId: Number(req.params.id), revisionId: Number(req.body?.revisionId)})});
  }));

  app.get('/api/staff/submissions', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    const user = await requireUser('submissions.read')(req);
    send(res, 200, await listSubmissions({pool, clock, actor: user, status: req.query.status, form: req.query.form, mine: req.query.mine === '1', page: req.query.page, pageSize: req.query.pageSize}));
  }));

  app.get('/api/staff/submissions.csv', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    const user = await requireUser('submissions.export')(req);
    const csv = await exportCsv({pool, clock, actor: user, status: req.query.status, form: req.query.form});
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="submissions.csv"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  }));

  app.get('/api/staff/submissions/:id', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    const user = await requireUser('submissions.read')(req);
    res.setHeader('Cache-Control', 'no-store');
    send(res, 200, {item: await getSubmission({pool, clock, actor: user, id: Number(req.params.id)})});
  }));

  app.patch('/api/staff/submissions/:id', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    const user = await requireUser('submissions.manage')(req);
    await updateSubmission({pool, clock, actor: user, id: Number(req.params.id), input: req.body ?? {}});
    send(res, 200, {item: await getSubmission({pool, clock, actor: user, id: Number(req.params.id)})});
  }));

  app.post('/api/staff/submissions/:id/notes', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    const user = await requireUser('submissions.manage')(req);
    await addNote({pool, clock, actor: user, id: Number(req.params.id), note: req.body?.note});
    send(res, 201, {item: await getSubmission({pool, clock, actor: user, id: Number(req.params.id)})});
  }));

  app.get('/api/staff/terms', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    await requireUser('content.read')(req);
    send(res, 200, {terms: await listTerms(pool, {vocabulary: req.query.vocabulary, q: req.query.q})});
  }));

  app.post('/api/staff/terms', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    const user = await requireUser('terms.manage')(req);
    send(res, 201, {term: await createTerm({pool, clock, actor: user, input: req.body ?? {}})});
  }));

  app.patch('/api/staff/terms/:id', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    const user = await requireUser('terms.manage')(req);
    send(res, 200, {term: await updateTerm({pool, clock, actor: user, id: Number(req.params.id), input: req.body ?? {}})});
  }));

  app.delete('/api/staff/terms/:id', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    const user = await requireUser('terms.manage')(req);
    await deleteTerm({pool, clock, actor: user, id: Number(req.params.id), mergeInto: req.query.mergeInto, detach: req.query.detach === '1'});
    send(res, 200, {ok: true});
  }));

  // ---- Homepage and hero: draft/publish content areas. Editors change approved fields only; see site-schema.js.
  app.get('/api/public/site', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    res.setHeader('Cache-Control', 'no-cache');
    send(res, 200, await siteStore.publishedSite(pool, clock));
  }));

  app.get('/api/staff/site', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    const user = await requireUser('homepage.edit')(req);
    const settings = await siteStore.getSettings(pool);
    send(res, 200, {areas: await siteStore.overview(pool), settings, canPublish: siteStore.canPublish(user, settings), canManage: allows(user.roles, 'homepage.manage')});
  }));

  // The real site, with the DRAFT content embedded, for the editor's desktop and mobile previews.
  app.get('/api/staff/site/preview', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    await requireUser('homepage.edit')(req);
    const html = shell ? shell() : '';
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
    if (!html) return send(res, 404, {error: 'Previews need the built site. Run npm run build, then start the server.'});
    res.type('html').send(injectSiteData(html, await siteStore.draftSite({pool, config})));
  }));

  app.put('/api/staff/site/settings', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    const user = await requireUser('homepage.manage')(req);
    send(res, 200, {settings: await siteStore.saveSettings({pool, clock, actor: user, input: req.body ?? {}})});
  }));

  app.get('/api/staff/site/:key', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    const user = await requireUser('homepage.edit')(req);
    const settings = await siteStore.getSettings(pool);
    res.setHeader('Cache-Control', 'no-store');
    send(res, 200, {...(await siteStore.getDocument({pool, config, key: req.params.key})), canPublish: siteStore.canPublish(user, settings), settings});
  }));

  app.put('/api/staff/site/:key', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    const user = await requireUser('homepage.edit')(req);
    send(res, 200, {state: await siteStore.saveDraft({pool, config, clock, actor: user, key: req.params.key, document: req.body?.document, baseVersion: req.body?.baseVersion})});
  }));

  app.post('/api/staff/site/:key/publish', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    const user = await requireUser('homepage.edit')(req);
    send(res, 200, {state: await siteStore.publish({pool, config, clock, actor: user, key: req.params.key, baseVersion: req.body?.baseVersion})});
  }));

  app.post('/api/staff/site/:key/discard', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    const user = await requireUser('homepage.edit')(req);
    send(res, 200, {state: await siteStore.discardDraft({pool, clock, actor: user, key: req.params.key})});
  }));

  app.get('/api/staff/site/:key/revisions', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    await requireUser('homepage.edit')(req);
    send(res, 200, {revisions: await siteStore.listRevisions({pool, key: req.params.key})});
  }));

  app.post('/api/staff/site/:key/restore', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    const user = await requireUser('homepage.edit')(req);
    send(res, 200, {state: await siteStore.restoreRevision({pool, config, clock, actor: user, key: req.params.key, revisionId: Number(req.body?.revisionId), baseVersion: req.body?.baseVersion})});
  }));

  app.post('/api/staff/schedule/run', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    await requireUser('content.publish')(req);
    send(res, 200, {promoted: await store.promoteScheduled(pool, clock)});
  }));

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status || 500;
    const message = status === 500 && config.appEnv !== 'test' ? 'Something went wrong.' : error.message;
    if (status === 500) console.error(error);
    send(res, status, {error: message, ...(error.problems ? {problems: error.problems} : {})});
  });

  return app;
}
