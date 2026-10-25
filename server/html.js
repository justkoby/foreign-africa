import {escapeHtml, stagingCanonicalBlocked} from './text.js';

const paths = {
  news: item => `/news/${item.slug}/`,
  commentary: item => `/${item.slug}/`,
  page: item => `/${item.slug}/`,
  programme: item => `/${item.slug}/`,
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
  const jsonLd = JSON.stringify({
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

export function articleRequest(pathname) {
  const path = `/${String(pathname || '').split('?')[0].split('/').filter(Boolean).join('/')}/`;
  if (path.startsWith('/admin/') || path.startsWith('/editor/') || path.startsWith('/api/')) return null;
  const news = path.match(/^\/news\/([a-z0-9-]+)\/$/);
  if (news) return {type: 'news', slug: news[1]};
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
