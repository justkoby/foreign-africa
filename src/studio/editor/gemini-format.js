// Safe Markdown + HTML parser and Tiptap node converter for Gemini editorial responses.
// Prevents raw Markdown (**bold**, ### heading) and raw HTML (<p>, <h3>) from leaking into the UI,
// blocks script/XSS injection, and builds valid Tiptap document nodes for editor insertion.

export function safeHref(value) {
  const href = String(value ?? '').trim();
  if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) return href.slice(0, 2000);
  if ((href.startsWith('/') || href.startsWith('#')) && !href.startsWith('//') && !href.includes('..')) return href.slice(0, 2000);
  return '';
}

function decodeEntities(text) {
  return String(text ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

// Pre-clean raw AI output: remove outer code fences, dangerous blocks (<script>, <style>, <iframe>),
// and normalize HTML block tags into clean line-oriented blocks so mixed HTML+Markdown parses seamlessly.
export function normalizeRawAiText(raw) {
  let text = String(raw ?? '').replace(/\r\n?/g, '\n').trim();

  // Strip outer markdown code fence if the model wrapped the entire response
  const fenceMatch = text.match(/^```(?:html|markdown|md|text)?\s*\n([\s\S]*?)\n```$/i);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  // Completely remove dangerous element blocks
  text = text
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/<script\b[^>]*\/?>/gi, '');

  // Convert HTML inline tags to Markdown equivalents before stripping unknown tags
  text = text
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, _tag, inner) => `**${inner.trim()}**`)
    .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, _tag, inner) => `*${inner.trim()}*`)
    .replace(/<u\b[^>]*>([\s\S]*?)<\/u>/gi, (_, inner) => `++${inner.trim()}++`)
    .replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => {
      const cleanUrl = safeHref(href);
      return cleanUrl ? `[${label.trim()}](${cleanUrl})` : label.trim();
    });

  // Convert HTML lists (<ol> and <ul>) into Markdown lists
  text = text.replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, (_, listBody) => {
    let index = 1;
    const items = [];
    listBody.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_m, itemContent) => {
      const cleanItem = itemContent.replace(/<\/?p\b[^>]*>/gi, ' ').replace(/\s+/g, ' ').trim();
      if (cleanItem) items.push(`${index++}. ${cleanItem}`);
      return '';
    });
    return `\n\n${items.join('\n')}\n\n`;
  });

  text = text.replace(/<ul\b[^>]*>([\s\S]*?)<\/ul>/gi, (_, listBody) => {
    const items = [];
    listBody.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_m, itemContent) => {
      const cleanItem = itemContent.replace(/<\/?p\b[^>]*>/gi, ' ').replace(/\s+/g, ' ').trim();
      if (cleanItem) items.push(`- ${cleanItem}`);
      return '';
    });
    return `\n\n${items.join('\n')}\n\n`;
  });

  // Standalone <li> outside <ul>/<ol>
  text = text.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_, itemContent) => `\n- ${itemContent.trim()}\n`);

  // Convert HTML headings <h1>..<h6> to Markdown headings (clamped to h2..h4 for Tiptap)
  text = text.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, levelStr, inner) => {
    const level = Math.min(Math.max(Number(levelStr), 2), 4);
    const hashes = '#'.repeat(level);
    return `\n\n${hashes} ${inner.replace(/\s+/g, ' ').trim()}\n\n`;
  });

  // Convert HTML blockquotes
  text = text.replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, inner) => {
    const cleanInner = inner.replace(/<\/?p\b[^>]*>/gi, '\n').trim();
    const quoted = cleanInner.split('\n').map(line => line.trim()).filter(Boolean).map(line => `> ${line}`).join('\n');
    return `\n\n${quoted}\n\n`;
  });

  // Convert <hr>, <br>, <p>, <div>
  text = text
    .replace(/<hr\b[^>]*\/?>/gi, '\n\n---\n\n')
    .replace(/<br\b[^>]*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<p\b[^>]*>/gi, '\n\n')
    .replace(/<\/div\s*>/gi, '\n\n')
    .replace(/<div\b[^>]*>/gi, '\n\n');

  // Strip any remaining HTML tags safely
  text = text.replace(/<\/?[a-zA-Z][^>]*>/g, '');

  // Decode standard HTML entities
  text = decodeEntities(text);

  // Normalize excessive blank lines
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

// Parse inline Markdown (**bold**, *italic*, ++underline++, [label](url)) into Tiptap text nodes with marks.
export function parseInlineTokens(text, activeMarks = []) {
  const input = String(text ?? '');
  if (!input) return [];

  const pattern = /(\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|\+\+([\s\S]+?)\+\+|\[([^\]]+)\]\(([^)]+)\)|\*([^*\n]+)\*|_([^_\n]+)_|`([^`\n]+)`)/;
  const match = input.match(pattern);

  if (!match) {
    return [{
      type: 'text',
      text: input,
      ...(activeMarks.length ? {marks: activeMarks} : {}),
    }];
  }

  const nodes = [];
  const before = input.slice(0, match.index);
  if (before) {
    nodes.push({
      type: 'text',
      text: before,
      ...(activeMarks.length ? {marks: activeMarks} : {}),
    });
  }

  const full = match[0];
  if (match[2] !== undefined || match[3] !== undefined) {
    // Bold (** or __)
    const inner = match[2] ?? match[3];
    const nextMarks = mergeMarks(activeMarks, {type: 'bold'});
    nodes.push(...parseInlineTokens(inner, nextMarks));
  } else if (match[4] !== undefined) {
    // Underline (++...++)
    const inner = match[4];
    const nextMarks = mergeMarks(activeMarks, {type: 'underline'});
    nodes.push(...parseInlineTokens(inner, nextMarks));
  } else if (match[5] !== undefined && match[6] !== undefined) {
    // Link [label](url)
    const label = match[5];
    const href = safeHref(match[6]);
    const nextMarks = href ? mergeMarks(activeMarks, {type: 'link', attrs: {href}}) : activeMarks;
    nodes.push(...parseInlineTokens(label, nextMarks));
  } else if (match[7] !== undefined || match[8] !== undefined) {
    // Italic (* or _)
    const inner = match[7] ?? match[8];
    const nextMarks = mergeMarks(activeMarks, {type: 'italic'});
    nodes.push(...parseInlineTokens(inner, nextMarks));
  } else if (match[9] !== undefined) {
    // Inline code `...` -> render as clean text
    nodes.push({
      type: 'text',
      text: match[9],
      ...(activeMarks.length ? {marks: activeMarks} : {}),
    });
  }

  const after = input.slice(match.index + full.length);
  if (after) {
    nodes.push(...parseInlineTokens(after, activeMarks));
  }

  return nodes;
}

function mergeMarks(existing, newMark) {
  const filtered = existing.filter(m => m.type !== newMark.type);
  return [...filtered, newMark];
}

function parseLinesWithHardBreaks(lines) {
  const inlineContent = [];
  lines.forEach((line, idx) => {
    const tokens = parseInlineTokens(line.trim());
    if (tokens.length) {
      if (idx > 0 && inlineContent.length) {
        inlineContent.push({type: 'hardBreak'});
      }
      inlineContent.push(...tokens);
    }
  });
  return inlineContent;
}

// Parse raw AI text (Markdown, HTML, or mixed) into an array of valid Tiptap block nodes.
export function parseAiContentToTiptapNodes(rawText) {
  const normalized = normalizeRawAiText(rawText);
  if (!normalized) return [];

  const lines = normalized.split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line) {
      i += 1;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      blocks.push({type: 'horizontalRule'});
      i += 1;
      continue;
    }

    // Heading (# to ######) -> mapped to levels 2, 3, 4
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const rawLevel = headingMatch[1].length;
      const level = rawLevel <= 2 ? 2 : rawLevel === 3 ? 3 : 4;
      const headingText = headingMatch[2].replace(/\s*#+\s*$/, '').trim();
      const content = parseInlineTokens(headingText);
      if (content.length) {
        blocks.push({type: 'heading', attrs: {level}, content});
      }
      i += 1;
      continue;
    }

    // Blockquote (> ...)
    if (line.startsWith('>')) {
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      const content = parseLinesWithHardBreaks(quoteLines.filter(Boolean));
      if (content.length) {
        blocks.push({
          type: 'blockquote',
          content: [{type: 'paragraph', content}],
        });
      }
      continue;
    }

    // Bullet list (-, *, •)
    if (/^([-*•])\s+(.+)$/.test(line)) {
      const items = [];
      while (i < lines.length) {
        const m = lines[i].trim().match(/^([-*•])\s+(.+)$/);
        if (!m) break;
        const itemInline = parseInlineTokens(m[2].trim());
        if (itemInline.length) {
          items.push({
            type: 'listItem',
            content: [{type: 'paragraph', content: itemInline}],
          });
        }
        i += 1;
      }
      if (items.length) {
        blocks.push({type: 'bulletList', content: items});
      }
      continue;
    }

    // Ordered list (1. or 1))
    if (/^\d+[.)]\s+(.+)$/.test(line)) {
      const items = [];
      while (i < lines.length) {
        const m = lines[i].trim().match(/^\d+[.)]\s+(.+)$/);
        if (!m) break;
        const itemInline = parseInlineTokens(m[1].trim());
        if (itemInline.length) {
          items.push({
            type: 'listItem',
            content: [{type: 'paragraph', content: itemInline}],
          });
        }
        i += 1;
      }
      if (items.length) {
        blocks.push({type: 'orderedList', content: items});
      }
      continue;
    }

    // Regular paragraph (collect consecutive non-special lines)
    const paraLines = [];
    while (i < lines.length) {
      const current = lines[i].trim();
      if (
        !current ||
        /^(-{3,}|\*{3,}|_{3,})$/.test(current) ||
        /^(#{1,6})\s+/.test(current) ||
        current.startsWith('>') ||
        /^([-*•])\s+/.test(current) ||
        /^\d+[.)]\s+/.test(current)
      ) {
        break;
      }
      paraLines.push(current);
      i += 1;
    }

    const content = parseLinesWithHardBreaks(paraLines);
    if (content.length) {
      blocks.push({type: 'paragraph', content});
    }
  }

  return blocks;
}

// Convert parsed Tiptap nodes into clean plain text (no Markdown or HTML syntax)
export function aiNodesToPlainText(nodes = []) {
  const inlineText = (inlineNodes = []) =>
    inlineNodes.map(n => (n.type === 'hardBreak' ? '\n' : n.text || '')).join('');

  return nodes
    .map(block => {
      if (block.type === 'heading' || block.type === 'paragraph') {
        return inlineText(block.content);
      }
      if (block.type === 'blockquote') {
        return (block.content || []).map(p => inlineText(p.content)).join('\n');
      }
      if (block.type === 'bulletList') {
        return (block.content || [])
          .map(li => `• ${(li.content || []).map(p => inlineText(p.content)).join(' ')}`)
          .join('\n');
      }
      if (block.type === 'orderedList') {
        return (block.content || [])
          .map((li, idx) => `${idx + 1}. ${(li.content || []).map(p => inlineText(p.content)).join(' ')}`)
          .join('\n');
      }
      return '';
    })
    .filter(Boolean)
    .join('\n\n');
}

// Convert parsed Tiptap nodes into sanitized semantic HTML
export function aiNodesToSafeHtml(nodes = []) {
  const renderInline = (inlineNodes = []) =>
    inlineNodes
      .map(n => {
        if (n.type === 'hardBreak') return '<br>';
        if (n.type !== 'text') return '';
        let html = escapeHtml(n.text);
        for (const mark of n.marks || []) {
          if (mark.type === 'bold') html = `<strong>${html}</strong>`;
          if (mark.type === 'italic') html = `<em>${html}</em>`;
          if (mark.type === 'underline') html = `<u>${html}</u>`;
          if (mark.type === 'link' && mark.attrs?.href) {
            html = `<a href="${escapeHtml(mark.attrs.href)}" target="_blank" rel="noopener noreferrer">${html}</a>`;
          }
        }
        return html;
      })
      .join('');

  const renderBlock = block => {
    if (block.type === 'paragraph') return `<p>${renderInline(block.content)}</p>`;
    if (block.type === 'heading') {
      const level = [2, 3, 4].includes(block.attrs?.level) ? block.attrs.level : 3;
      return `<h${level}>${renderInline(block.content)}</h${level}>`;
    }
    if (block.type === 'blockquote') {
      return `<blockquote>${(block.content || []).map(renderBlock).join('')}</blockquote>`;
    }
    if (block.type === 'bulletList') {
      return `<ul>${(block.content || [])
        .map(li => `<li>${(li.content || []).map(c => (c.type === 'paragraph' ? renderInline(c.content) : renderBlock(c))).join('')}</li>`)
        .join('')}</ul>`;
    }
    if (block.type === 'orderedList') {
      return `<ol>${(block.content || [])
        .map(li => `<li>${(li.content || []).map(c => (c.type === 'paragraph' ? renderInline(c.content) : renderBlock(c))).join('')}</li>`)
        .join('')}</ol>`;
    }
    if (block.type === 'horizontalRule') return '<hr>';
    return '';
  };

  return nodes.map(renderBlock).filter(Boolean).join('\n');
}

// Classify whether a response should be presented as an Article Suggestion card, Metadata card, or Editorial Analysis
export const ARTICLE_CONTENT_ACTIONS = new Set([
  'improve',
  'shorten',
  'expand',
  'tone_institutional',
  'simplify',
  'rewrite',
  'draft',
]);

export const METADATA_ACTIONS = new Set([
  'headlines',
  'excerpt',
  'seo',
  'tags',
  'social',
]);

export const ANALYSIS_ACTIONS = new Set([
  'grammar',
  'factcheck',
]);

export function classifyResponseKind(action, promptText = '') {
  if (ARTICLE_CONTENT_ACTIONS.has(action)) return 'article_content';
  if (METADATA_ACTIONS.has(action)) return 'metadata';
  if (ANALYSIS_ACTIONS.has(action)) return 'analysis';
  // For custom prompts, detect if the editor asked to write/draft/rewrite/improve/expand/paraphrase
  if (/\b(write|rewrite|draft|paragraph|section|intro|introduction|conclusion|expand|shorten|improve|rephrase|paraphrase)\b/i.test(promptText)) {
    return 'article_content';
  }
  return 'conversation';
}

// Extract structured options for metadata actions (headlines, seo, tags, excerpt)
export function extractStructuredMetadata(action, rawText) {
  const nodes = parseAiContentToTiptapNodes(rawText);
  const plain = aiNodesToPlainText(nodes);

  if (action === 'headlines') {
    const lines = normalizeRawAiText(rawText)
      .split('\n')
      .map(l => l.replace(/^(?:\d+[.)]|[-*•]|#+\s*)\s*/, '').replace(/\*\*/g, '').replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim())
      .filter(l => l.length > 8 && !/^(here are|suggested|alternative|headlines)/i.test(l));
    return {headlines: lines.slice(0, 6)};
  }

  if (action === 'seo') {
    const lines = normalizeRawAiText(rawText)
      .split('\n')
      .map(l => l.replace(/^[-*•\d.)#]+\s*/, '').replace(/\*\*/g, '').trim())
      .filter(Boolean);
    let seoTitle = '';
    let seoDescription = '';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^(?:seo\s*)?title\s*:/i.test(line) && !seoTitle) {
        seoTitle = line.replace(/^(?:seo\s*)?title\s*:\s*/i, '').replace(/^["']|["']$/g, '').trim();
        if (!seoTitle && lines[i + 1]) seoTitle = lines[i + 1].replace(/^["']|["']$/g, '').trim();
      } else if (/^(?:meta\s*|seo\s*)?description\s*:/i.test(line) && !seoDescription) {
        seoDescription = line.replace(/^(?:meta\s*|seo\s*)?description\s*:\s*/i, '').replace(/^["']|["']$/g, '').trim();
        if (!seoDescription && lines[i + 1]) seoDescription = lines[i + 1].replace(/^["']|["']$/g, '').trim();
      }
    }
    return {
      seoTitle: seoTitle.slice(0, 60),
      seoDescription: seoDescription.slice(0, 160),
    };
  }

  if (action === 'tags') {
    const cleaned = normalizeRawAiText(rawText).replace(/\*\*/g, '');
    let category = '';
    const catMatch = cleaned.match(/category\s*:\s*([^\n,;]+)/i);
    if (catMatch) category = catMatch[1].trim();
    const withoutCat = cleaned.replace(/.*category\s*:[^\n]*/gi, '').replace(/tags?\s*:/gi, '');
    const tags = withoutCat
      .split(/[,;\n]/)
      .map(t => t.replace(/^[-*•\d.)#]+\s*/, '').replace(/^["']|["']$/g, '').trim())
      .filter(t => t.length > 1 && t.length <= 60 && !/^(suggested|relevant|topical|here are)/i.test(t));
    return {category, tags: [...new Set(tags)].slice(0, 10)};
  }

  if (action === 'excerpt') {
    const excerpt = plain
      .replace(/^(?:excerpt|summary)\s*:\s*/i, '')
      .replace(/^["'“”]+|["'“”]+$/g, '')
      .trim();
    return {excerpt: excerpt.slice(0, 500)};
  }

  return {};
}
