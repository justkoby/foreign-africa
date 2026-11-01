import express from 'express';
import {existsSync, readFileSync} from 'node:fs';
import {access, constants} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {allows} from './permissions.js';
import {externalRedirect, renderContentPage, robotsText, sitemapXml} from './html.js';
import {readCookie, sameSecret, originAllowed, sqlTime} from './text.js';
import {listMedia, mediaRootProblem, openMedia, readUpload, removeMedia, saveUpload, updateMediaAlt} from './media.js';
import {createHandler as createDiscoverHandler} from '../api/discover.js';
import {createHandler as createCmsHandler} from '../api/cms.js';
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
    return {status: 'ok', detail: 'The media directory is writable.'};
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

export function createApp({config, pool, clock = () => Date.now()}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({limit: '1mb'}));

  app.get('/.well-known/acme-challenge/:token', (req, res) => {
    const body = acmeChallenge(req.params.token);
    if (!body) return send(res, 404, {error: 'Not found.'});
    res.type('text/plain').send(body);
  });

  app.use((req, res, next) => {
    if (config.appEnv !== 'staging') return next();
    if (req.path.startsWith('/.well-known/acme-challenge/')) return next();
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
  const cms = createCmsHandler();
  app.post('/api/discover', (req, res, next) => { Promise.resolve(discover(req, res)).catch(next); });
  app.use('/api/cms', (req, res, next) => {
    if (!req.url.startsWith('/api/cms')) req.url = `/api/cms${req.url.startsWith('/') ? req.url : `/${req.url}`}`;
    Promise.resolve(cms(req, res)).catch(next);
  });

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
    if (!pool) return send(res, 503, {ok: false});
    try {
      await store.databaseReachable(pool);
      send(res, 200, {ok: true});
    } catch {
      send(res, 503, {ok: false});
    }
  }));

  app.get('/api/public/content', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
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

  app.get('/media/:id', route(async (req, res) => {
    if (!pool || !/^\d+$/.test(req.params.id)) return send(res, 404, {error: 'Not found.'});
    const opened = await openMedia(pool, config, Number(req.params.id), false);
    if (!opened) return send(res, 404, {error: 'Not found.'});
    if (opened.redirect) return res.redirect(302, opened.redirect);
    res.setHeader('Content-Type', opened.mime);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
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
      send(res, 200, {user: await actor(req), configured: true});
    } catch {
      send(res, 200, {user: null, configured: true, error: 'The staff database is not reachable.'});
    }
  }));

  app.get('/api/staff/dashboard', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    await requireUser('content.read')(req);
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
    send(res, 200, {database, media: await storageCheck(config), recentErrors, uploadFailures: uploadFailures ?? null, backup: {status: 'unknown', detail: 'Hostinger backups are managed in hPanel. This screen cannot confirm them.'}});
  }));

  app.get('/api/staff/settings', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    await requireUser('settings.read')(req);
    send(res, 200, {appEnv: config.appEnv, publicSiteUrl: config.publicSiteUrl, mediaConfigured: Boolean(config.mediaRoot), cookieSecure: config.cookieSecure});
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
    send(res, 200, await store.listContent(pool, {type: req.query.type, status: req.query.status, q: req.query.q, includeDrafts: true, page: req.query.page, pageSize: req.query.pageSize, sort: req.query.sort, clock}));
  }));

  app.get('/api/staff/media', route(async (req, res) => {
    if (!requireDatabase(req, res)) return;
    await requireUser('content.read')(req);
    send(res, 200, {files: await listMedia(pool, req.query.q)});
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
    await requireUser('content.update.any')(req);
    send(res, 200, {asset: await updateMediaAlt({pool, id: Number(req.params.id), alt: req.body?.alt})});
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
    send(res, status, {error: message});
  });

  return app;
}
