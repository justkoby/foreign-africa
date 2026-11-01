import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import express from 'express';
import {createApp} from './app.js';
import {publicItem} from './content-store.js';
import {articleRequest, externalRedirect, injectArticle} from './html.js';

export async function decorateHtml({pool, config, pathname, html, clock = () => Date.now()}) {
  const request = articleRequest(pathname);
  if (!request || !pool || !html) return null;
  let item = null;
  try { item = await publicItem(pool, request.type, request.slug, clock); } catch { return null; }
  if (!item) return null;
  const redirect = externalRedirect(item);
  if (redirect) return {redirect};
  return {body: injectArticle(html, config, item)};
}

export function createSite({config, pool, dist, clock = () => Date.now()}) {
  const site = express();
  site.disable('x-powered-by');
  site.use(createApp({config, pool, clock}));
  site.use(express.static(dist, {index: false}));
  site.get(/^\/(?!api\/).*/, async (req, res) => {
    const file = join(dist, 'index.html');
    if (!existsSync(file)) return res.status(404).type('text/plain').send('The public site has not been built yet.');
    const shell = readFileSync(file, 'utf8');
    const decorated = await decorateHtml({pool, config, pathname: req.path, html: shell, clock});
    if (decorated?.redirect) return res.redirect(302, decorated.redirect);
    res.type('html').send(decorated?.body || shell);
  });
  return site;
}
