import {escapeHtml, stagingCanonicalBlocked} from './text.js';

const paths = {
  news: item => `/news/${item.slug}/`,
  commentary: item => `/${item.slug}/`,
  page: item => `/${item.slug}/`,
  programme: item => `/${item.slug}/`,
  event: item => `/events/${item.slug}/`,
};

function value(item, ...keys) {
  for (const key of keys) if (item[key]) return item[key];
  return '';
}

export function publicPath(item) {
  return (paths[item.content_type] ?? paths.page)(item);
}

export function robotsText(config) {
  if (config.appEnv !== 'production') return 'User-agent: *\nDisallow: /\n';
  return `User-agent: *\nAllow: /\nSitemap: ${config.publicSiteUrl}/sitemap.xml\n`;
}

export function sitemapXml(config, items) {
  const urls = items.map(item => `  <url><loc>${escapeHtml(config.publicSiteUrl + publicPath(item))}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function articleMeta(config, item) {
  if (stagingCanonicalBlocked(config)) {
    throw new Error('Staging canonical would point at the production domain. Set PUBLIC_SITE_URL to the preview host.');
  }
  const type = value(item, 'content_type', 'type') || 'page';
  const title = value(item, 'seo_title', 'seoTitle') || item.title;
  const description = value(item, 'seo_description', 'seoDescription') || item.summary || '';
  const author = value(item, 'author_name', 'authorName');
  const published = value(item, 'published_at', 'publishedAt');
  const image = value(item, 'socialImage', 'image');
  const canonical = config.publicSiteUrl + publicPath({...item, content_type: type, slug: item.slug});
  const imageUrl = image ? (String(image).startsWith('http') ? image : config.publicSiteUrl + image) : '';
  const index = config.appEnv === 'production' ? 'index,follow' : 'noindex,nofollow';
  const jsonLd = JSON.stringify(type === 'event' ? {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: item.title,
    startDate: value(item, 'starts_at', 'startsAt', 'event_date', 'eventDate') || undefined,
    endDate: value(item, 'ends_at', 'endsAt') || undefined,
    eventStatus: item.cancelled ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    location: item.venue ? {'@type': 'Place', name: item.venue} : undefined,
    description,
    image: imageUrl || undefined,
    url: canonical,
  } : {
    '@context': 'https://schema.org',
    '@type': type === 'news' ? 'NewsArticle' : 'Article',
    headline: item.title,
    datePublished: published || undefined,
    description,
    author: author ? {name: author} : undefined,
    image: imageUrl || undefined,
    mainEntityOfPage: canonical,
  });
  return {title, description, author, canonical, imageUrl, index, jsonLd, body: value(item, 'body_html', 'html')};
}

export function renderContentPage(config, item) {
  const meta = articleMeta(config, item);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(meta.title)} — Foreign Africa</title>
<meta name="description" content="${escapeHtml(meta.description)}">
${meta.author ? `<meta name="author" content="${escapeHtml(meta.author)}">` : ''}
<meta name="robots" content="${meta.index}">
<link rel="canonical" href="${escapeHtml(meta.canonical)}">
<meta property="og:title" content="${escapeHtml(meta.title)}">
<meta property="og:description" content="${escapeHtml(meta.description)}">
<meta property="og:url" content="${escapeHtml(meta.canonical)}">
<meta property="og:type" content="article">
${meta.imageUrl ? `<meta property="og:image" content="${escapeHtml(meta.imageUrl)}">` : ''}
<script type="application/ld+json">${meta.jsonLd.replace(/</g, '\\u003c')}</script>
</head>
<body>
<article>
<h1>${escapeHtml(item.title)}</h1>
${meta.body}
</article>
</body>
</html>`;
}

export function injectArticle(shell, config, item) {
  const meta = articleMeta(config, item);
  const tags = `<title>${escapeHtml(meta.title)} — Foreign Africa</title>
<meta name="description" content="${escapeHtml(meta.description)}">
${meta.author ? `<meta name="author" content="${escapeHtml(meta.author)}">` : ''}
<meta name="robots" content="${meta.index}">
<link rel="canonical" href="${escapeHtml(meta.canonical)}">
<meta property="og:title" content="${escapeHtml(meta.title)}">
<meta property="og:description" content="${escapeHtml(meta.description)}">
<meta property="og:url" content="${escapeHtml(meta.canonical)}">
<meta property="og:type" content="article">
${meta.imageUrl ? `<meta property="og:image" content="${escapeHtml(meta.imageUrl)}">` : ''}
<script type="application/ld+json">${meta.jsonLd.replace(/</g, '\\u003c')}</script>`;
  const article = `<article class="article-prerender"><h1>${escapeHtml(item.title)}</h1>${meta.author ? `<p>By ${escapeHtml(meta.author)}</p>` : ''}${meta.body}</article>`;
  return shell
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/<meta name="description" content="[^"]*">/, '')
    .replace('</head>', `${tags}</head>`)
    .replace(/<div id="root">\s*<\/div>/, `<div id="root">${article}</div>`);
}

export function injectPreviewArticle(shell, config, item) {
  const title = item.seoTitle || item.title || 'Untitled';
  const description = item.seoDescription || item.summary || '';
  const author = item.authorName || '';
  const type = item.type || item.content_type || 'news';
  const status = item.status || 'draft';
  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description);
  const safeAuthor = escapeHtml(author);

  const previewData = {
    preview: true,
    item: {
      ...item,
      type,
      preview: true,
    },
  };
  const separators = new RegExp(`[${String.fromCharCode(0x2028)}${String.fromCharCode(0x2029)}]`, 'g');
  const json = JSON.stringify(previewData)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(separators, match => `\\u${match.charCodeAt(0).toString(16)}`);

  const previewScript = `<script id="fa-preview-data" type="application/json">${json}</script><script>try{window.__FA_PREVIEW_DATA__=JSON.parse(document.getElementById('fa-preview-data').textContent);}catch(e){}</script>`;

  const tags = `<title>${safeTitle} — Foreign Africa (CMS Preview)</title>
<meta name="description" content="${safeDesc}">
${safeAuthor ? `<meta name="author" content="${safeAuthor}">` : ''}
<meta name="robots" content="noindex, nofollow">
${previewScript}`;

  const bannerHtml = `<aside class="fa-preview-bar" role="status" aria-label="CMS Preview">
  <div class="fa-preview-bar-inner">
    <div class="fa-preview-bar-left">
      <span class="fa-preview-badge">CMS PREVIEW</span>
      <span class="fa-preview-status">Status: <strong>${escapeHtml(status.toUpperCase())}</strong></span>
      <span class="fa-preview-hint">· Staff only · Unpublished draft changes are visible here</span>
    </div>
    <div class="fa-preview-bar-right">
      <a href="${type === 'event' ? `/admin#/events/${item.dbId || item.id}` : `/admin#/content/${escapeHtml(type)}/${item.id}`}" class="fa-preview-btn fa-preview-btn--edit">← Back to Editor</a>
      ${status === 'published' ? `<a href="${publicPath({...item, content_type: type})}" class="fa-preview-btn fa-preview-btn--live" target="_blank" rel="noreferrer">View Live ↗</a>` : ''}
    </div>
  </div>
</aside>`;

  const article = `<article class="article-prerender"><h1>${safeTitle}</h1>${safeAuthor ? `<p>By ${safeAuthor}</p>` : ''}${item.html || ''}</article>`;

  return shell
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/<meta name="description" content="[^"]*">/, '')
    .replace('</head>', `${tags}</head>`)
    .replace('<body', '<body class="has-preview-bar"')
    .replace(/<body([^>]*)>/, `<body$1>${bannerHtml}`)
    .replace(/<div id="root">\s*<\/div>/, `<div id="root">${article}</div>`);
}

export function articleRequest(pathname) {
  const path = `/${String(pathname || '').split('?')[0].split('/').filter(Boolean).join('/')}/`;
  if (path.startsWith('/admin/') || path.startsWith('/editor/') || path.startsWith('/api/')) return null;
  const news = path.match(/^\/news\/([a-z0-9-]+)\/$/);
  if (news) return {type: 'news', slug: news[1]};
  const event = path.match(/^\/events\/([a-z0-9-]+)\/$/);
  if (event) return {type: 'event', slug: event[1]};
  const blog = path.match(/^\/blog\/([a-z0-9-]+)\/$/);
  if (blog) return {type: 'commentary', slug: blog[1]};
  const root = path.match(/^\/([a-z0-9-]+)\/$/);
  if (root) return {type: 'commentary', slug: root[1]};
  return null;
}

export function externalRedirect(item) {
  if (!item?.externalUrl || item.complete) return '';
  try {
    const url = new URL(item.externalUrl);
    if (url.protocol === 'https:' && (url.hostname === 'foreignafrica.org' || url.hostname === 'www.foreignafrica.org')) return url.toString();
  } catch { /* Ignore a stored address that is not an https Foreign Africa URL. */ }
  return '';
}
