import {escapeHtml} from './text.js';
import {isYoutubeId, youtubeEmbedSrc, youtubeId} from './embeds.js';

const blocks = new Set(['paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'blockquote', 'horizontalRule', 'image', 'hardBreak', 'table', 'tableRow', 'tableHeader', 'tableCell', 'video']);
const cellBlocks = new Set(['paragraph', 'bulletList', 'orderedList', 'listItem', 'hardBreak']);
const limits = {rows: 100, columns: 20, cells: 1000, span: 20};
const marks = new Set(['bold', 'italic', 'underline', 'link']);

function rejected(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

export function plainDocument(text) {
  const paragraphs = String(text ?? '').split(/\n{2,}/).map(paragraph => paragraph.trim()).filter(Boolean);
  return {
    type: 'doc',
    content: (paragraphs.length ? paragraphs : []).map(paragraph => ({
      type: 'paragraph',
      content: paragraph.split('\n').flatMap((line, index) => index === 0 ? [{type: 'text', text: line}] : [{type: 'hardBreak'}, {type: 'text', text: line}]),
    })),
  };
}

export function safeSrc(value) {
  const src = String(value ?? '');
  if (!/^\/(images|media)\/[A-Za-z0-9._/-]+$/.test(src) || src.includes('..')) return '';
  return src;
}

export function safeHref(value) {
  const href = String(value ?? '').trim();
  if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) return href.slice(0, 2000);
  if ((href.startsWith('/') || href.startsWith('#')) && !href.startsWith('//') && !href.includes('..')) return href.slice(0, 2000);
  return '';
}

function cleanText(node) {
  const text = String(node.text ?? '');
  if (!text) return null;
  const next = {type: 'text', text: text.slice(0, 20000)};
  const allowed = (node.marks ?? []).filter(mark => marks.has(mark?.type)).map(mark => {
    if (mark.type !== 'link') return {type: mark.type};
    const href = safeHref(mark.attrs?.href);
    return href ? {type: 'link', attrs: {href}} : null;
  }).filter(Boolean);
  if (allowed.length) next.marks = allowed;
  return next;
}

const span = value => Math.min(Math.max(Math.trunc(Number(value)) || 1, 1), limits.span);

function cleanTable(node, depth, ctx) {
  if (ctx.inTable) throw rejected('Tables cannot be placed inside tables.');
  const rows = node.content ?? [];
  if (!rows.length || rows.length > limits.rows) throw rejected(`A table needs between 1 and ${limits.rows} rows.`);
  const cleaned = rows.map(row => {
    if (row?.type !== 'tableRow') throw rejected('The table is not valid.');
    const cells = row.content ?? [];
    if (!cells.length || cells.length > limits.columns) throw rejected(`A table row needs between 1 and ${limits.columns} cells.`);
    return {type: 'tableRow', content: cells.map(cell => {
      if (cell?.type !== 'tableCell' && cell?.type !== 'tableHeader') throw rejected('The table is not valid.');
      ctx.cells += 1;
      if (ctx.cells > limits.cells) throw rejected('The table is too large.');
      const content = (cell.content ?? []).map(child => cleanNode(child, depth + 3, {...ctx, inTable: true})).filter(Boolean);
      const colspan = span(cell.attrs?.colspan), rowspan = span(cell.attrs?.rowspan);
      return {type: cell.type, attrs: {colspan, rowspan}, content: content.length ? content : [{type: 'paragraph'}]};
    })};
  });
  return {type: 'table', content: cleaned};
}

function cleanNode(node, depth, ctx = {cells: 0, inTable: false}) {
  if (!node || typeof node !== 'object' || depth > 12) throw rejected('The article contains formatting that is not allowed.');
  if (node.type === 'text') return cleanText(node);
  if (node.type === 'hardBreak') return {type: 'hardBreak'};
  if (!blocks.has(node.type)) throw rejected('The article contains formatting that is not allowed.');
  if (node.type === 'table') return cleanTable(node, depth, ctx);
  // Table cells hold text and lists only; images, video, quotes and headings belong outside the table.
  if (ctx.inTable && !cellBlocks.has(node.type)) throw rejected('Table cells can only contain text and lists. Place images and videos outside the table.');
  if (node.type === 'tableRow' || node.type === 'tableHeader' || node.type === 'tableCell') throw rejected('The table is not valid.');
  if (node.type === 'video') {
    // Only an approved YouTube id survives. A pasted URL is reduced to its id; anything else is refused.
    const id = isYoutubeId(node.attrs?.videoId) ? node.attrs.videoId : youtubeId(node.attrs?.url);
    if (!id) throw rejected('Use a YouTube link (youtube.com or youtu.be) for videos.');
    return {type: 'video', attrs: {provider: 'youtube', videoId: id, title: String(node.attrs?.title ?? '').slice(0, 120), caption: String(node.attrs?.caption ?? '').slice(0, 300)}};
  }
  if (node.type === 'horizontalRule') return {type: 'horizontalRule'};
  if (node.type === 'image') {
    const src = safeSrc(node.attrs?.src);
    if (!src) throw rejected('Use an image from the media library or the existing site images.');
    const href = safeHref(node.attrs?.href);
    return {type: 'image', attrs: {src, alt: String(node.attrs?.alt ?? '').slice(0, 300), caption: String(node.attrs?.caption ?? '').slice(0, 500), ...(href ? {href} : {})}};
  }
  const content = (node.content ?? []).map(child => cleanNode(child, depth + 1, ctx)).filter(Boolean);
  if (node.type === 'heading') {
    const level = [2, 3, 4].includes(Number(node.attrs?.level)) ? Number(node.attrs.level) : 2;
    return {type: 'heading', attrs: {level}, ...(content.length ? {content} : {})};
  }
  return content.length || node.type === 'paragraph' ? {type: node.type, ...(content.length ? {content} : {})} : {type: node.type};
}

export function normalizeDocument(input) {
  const source = input == null || input === '' ? {type: 'doc', content: []}
    : typeof input === 'string' ? plainDocument(input)
    : input.type !== 'doc' && typeof input.text === 'string' ? plainDocument(input.text)
    : input;
  if (!source || source.type !== 'doc' || !Array.isArray(source.content)) throw rejected('The article format was not recognised.');
  if (JSON.stringify(source).length > 500000) throw rejected('The article is too long.');
  const ctx = {cells: 0, inTable: false};
  return {type: 'doc', content: source.content.map(node => cleanNode(node, 0, ctx)).filter(Boolean)};
}

function renderInline(nodes = []) {
  return nodes.map(node => {
    if (node.type === 'hardBreak') return '<br>';
    if (node.type !== 'text') return '';
    let html = escapeHtml(node.text);
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') html = `<strong>${html}</strong>`;
      if (mark.type === 'italic') html = `<em>${html}</em>`;
      if (mark.type === 'underline') html = `<u>${html}</u>`;
      if (mark.type === 'link') html = `<a href="${escapeHtml(mark.attrs.href)}">${html}</a>`;
    }
    return html;
  }).join('');
}

function renderBlock(node) {
  if (node.type === 'paragraph') return `<p>${renderInline(node.content)}</p>`;
  if (node.type === 'heading') return `<h${node.attrs.level}>${renderInline(node.content)}</h${node.attrs.level}>`;
  if (node.type === 'bulletList') return `<ul>${(node.content ?? []).map(renderBlock).join('')}</ul>`;
  if (node.type === 'orderedList') return `<ol>${(node.content ?? []).map(renderBlock).join('')}</ol>`;
  if (node.type === 'listItem') return `<li>${(node.content ?? []).map(child => child.type === 'paragraph' ? renderInline(child.content) : renderBlock(child)).join('')}</li>`;
  if (node.type === 'blockquote') return `<blockquote>${(node.content ?? []).map(renderBlock).join('')}</blockquote>`;
  if (node.type === 'horizontalRule') return '<hr>';
  if (node.type === 'image') {
    const img = `<img src="${escapeHtml(node.attrs.src)}" alt="${escapeHtml(node.attrs.alt || '')}">`;
    const linked = node.attrs.href ? `<a href="${escapeHtml(node.attrs.href)}">${img}</a>` : img;
    const caption = node.attrs.caption ? `<figcaption>${escapeHtml(node.attrs.caption)}</figcaption>` : '';
    return `<figure>${linked}${caption}</figure>`;
  }
  if (node.type === 'table') return renderTable(node);
  if (node.type === 'video') {
    const title = escapeHtml(node.attrs.title || 'Video');
    const caption = node.attrs.caption ? `<figcaption>${escapeHtml(node.attrs.caption)}</figcaption>` : '';
    return `<figure class="article-video"><div class="video-frame"><iframe src="${youtubeEmbedSrc(node.attrs.videoId)}" title="${title}" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"></iframe></div>${caption}</figure>`;
  }
  return '';
}

function renderTable(node) {
  const rows = node.content ?? [];
  const isHead = row => Boolean(row?.content?.length) && row.content.every(cell => cell.type === 'tableHeader');
  const head = isHead(rows[0]) && rows.length > 1 ? rows[0] : null;
  const cell = (item, scope) => {
    const tag = item.type === 'tableHeader' ? 'th' : 'td';
    const attrs = `${item.attrs?.colspan > 1 ? ` colspan="${item.attrs.colspan}"` : ''}${item.attrs?.rowspan > 1 ? ` rowspan="${item.attrs.rowspan}"` : ''}${tag === 'th' && scope ? ` scope="${scope}"` : ''}`;
    return `<${tag}${attrs}>${(item.content ?? []).map(renderBlock).join('')}</${tag}>`;
  };
  const row = (item, scope) => `<tr>${(item.content ?? []).map(entry => cell(entry, scope)).join('')}</tr>`;
  const body = (head ? rows.slice(1) : rows).map(item => row(item, '')).join('');
  return `<div class="article-table"><table>${head ? `<thead>${row(head, 'col')}</thead>` : ''}<tbody>${body}</tbody></table></div>`;
}

export function documentHtml(document) {
  return (document?.content ?? []).map(renderBlock).join('');
}

export function documentText(document) {
  const walk = node => {
    if (!node) return '';
    if (node.type === 'text') return node.text;
    if (node.type === 'image') return `${node.attrs?.alt || ''} ${node.attrs?.caption || ''}`;
    if (node.type === 'video') return `${node.attrs?.title || ''} ${node.attrs?.caption || ''}`;
    return (node.content ?? []).map(walk).join(node.type === 'paragraph' || node.type === 'heading' ? '\n' : ' ');
  };
  return walk(document).replace(/\s+/g, ' ').trim();
}

function inlineFrom(children, links) {
  const content = [];
  const pushText = (text, marks) => {
    if (!text) return;
    content.push(marks?.length ? {type: 'text', text, marks} : {type: 'text', text});
  };
  for (const child of children ?? []) {
    if (typeof child === 'string') {
      pushText(child.replace(/\u00a0/g, ' '));
      continue;
    }
    if (!child || typeof child !== 'object') continue;
    if (child.tag === 'br') {
      content.push({type: 'hardBreak'});
      continue;
    }
    if (child.tag === 'a') {
      const href = safeHref(localHref(child.href, links));
      const marks = href ? [{type: 'link', attrs: {href}}] : [];
      for (const piece of inlineFrom(child.children, links)) {
        if (piece.type === 'text') content.push({...piece, marks: [...(piece.marks ?? []), ...marks]});
        else content.push(piece);
      }
      continue;
    }
    const mark = child.tag === 'strong' || child.tag === 'b' ? 'bold' : child.tag === 'em' || child.tag === 'i' ? 'italic' : child.tag === 'u' ? 'underline' : '';
    const nested = inlineFrom(child.children, links);
    if (!mark) content.push(...nested);
    else content.push(...nested.map(piece => piece.type === 'text' ? {...piece, marks: [...(piece.marks ?? []), {type: mark}]} : piece));
  }
  return content.filter(piece => piece.type !== 'text' || piece.text);
}

function localHref(href, articles) {
  try {
    const url = new URL(href, 'https://foreignafrica.org');
    if (url.hostname === 'foreignafrica.org' || url.hostname === 'www.foreignafrica.org') {
      const article = articles.find(item => {
        try { return new URL(item.sourceUrl).pathname === url.pathname; } catch { return false; }
      });
      if (article) return `/${article.slug}/${url.hash}`;
      if (url.pathname === '/remote-internship-programme-rip/') return `${url.pathname}${url.search}${url.hash}`;
    }
  } catch { /* Keep the original href when it is not a site URL. */ }
  return href;
}

function imageFrom(node, links) {
  if (!node || typeof node !== 'object') return null;
  if (node.tag === 'img') {
    const src = safeSrc(node.src);
    return src ? {type: 'image', attrs: {src, alt: String(node.alt || '').slice(0, 300), caption: ''}} : null;
  }
  if (node.tag === 'a') {
    const image = (node.children ?? []).map(child => imageFrom(child, links)).find(Boolean);
    const href = safeHref(localHref(node.href, links));
    if (image && href) image.attrs.href = href;
    return image;
  }
  if (node.tag === 'figure') {
    const image = (node.children ?? []).map(child => imageFrom(child, links)).find(Boolean);
    const caption = (node.children ?? []).find(child => child?.tag === 'figcaption');
    if (image && caption) image.attrs.caption = editorialText([caption]).slice(0, 500);
    return image;
  }
  return null;
}

function blockFrom(node, links) {
  if (!node || typeof node !== 'object' || typeof node.tag !== 'string') return [];
  if (!['p', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'blockquote', 'hr', 'figure', 'img'].includes(node.tag)) {
    return (node.children ?? []).flatMap(child => typeof child === 'string' ? [] : blockFrom(child, links));
  }
  if (node.tag === 'figure' || node.tag === 'img') {
    const image = imageFrom(node, links);
    return image ? [image] : [];
  }
  if (node.tag === 'hr') return [{type: 'horizontalRule'}];
  if (node.tag === 'ul' || node.tag === 'ol') {
    const items = (node.children ?? []).filter(child => child?.tag === 'li').map(child => ({type: 'listItem', content: [{type: 'paragraph', content: inlineFrom(child.children, links)}]}));
    return items.length ? [{type: node.tag === 'ul' ? 'bulletList' : 'orderedList', content: items}] : [];
  }
  if (node.tag === 'blockquote') {
    const inner = (node.children ?? []).flatMap(child => typeof child === 'string' ? [{type: 'paragraph', content: inlineFrom([child], links)}] : blockFrom(child, links));
    return inner.length ? [{type: 'blockquote', content: inner}] : [];
  }
  const heading = /^h([2-4])$/.exec(node.tag);
  const content = inlineFrom(node.children, links);
  if (!content.length) return [];
  if (heading) return [{type: 'heading', attrs: {level: Number(heading[1])}, content}];
  return [{type: 'paragraph', content}];
}

export function editorialText(nodes) {
  const walk = node => typeof node === 'string' ? node : (node?.children ?? []).map(walk).join(' ');
  return (nodes ?? []).map(walk).join(' ').replace(/\s+/g, ' ').trim();
}

export function editorialDocument(nodes, articles = []) {
  const content = (nodes ?? []).flatMap(node => typeof node === 'string' ? [] : blockFrom(node, articles));
  return normalizeDocument({type: 'doc', content});
}
