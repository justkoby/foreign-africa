import test from 'node:test';
import assert from 'node:assert/strict';
import {injectPreviewArticle} from '../server/html.js';
import {assistEditorial} from '../server/gemini-service.js';
import {normalizeDocument, documentHtml} from '../server/document.js';
import {resolvePage} from '../src/pages/routes.js';
import {
  normalizeRawAiText,
  parseAiContentToTiptapNodes,
  aiNodesToPlainText,
  aiNodesToSafeHtml,
  classifyResponseKind,
  extractStructuredMetadata,
} from '../src/studio/editor/gemini-format.js';

const sampleShell = `<!doctype html><html lang="en"><head><meta charset="UTF-8"/><meta name="description" content="Old description"/><title>Old title</title><link rel="stylesheet" href="/assets/style.css"/></head><body><div id="root"></div></body></html>`;

test('injectPreviewArticle embeds preview data, banner, and design shell', () => {
  const item = {
    id: 18,
    type: 'news',
    title: "Empowering Africa's Next Generation of Leaders Through Innovation and Collaboration",
    slug: 'empowering-africas-next-generation',
    summary: 'Building the Future of African Leadership.',
    authorName: 'Foreign Africa Team',
    status: 'draft',
    html: '<p>Young Africans are developing innovative solutions.</p>',
    category: 'Institutional engagement',
  };

  const html = injectPreviewArticle(sampleShell, {publicSiteUrl: 'https://example.com'}, item);

  // Check title
  assert.ok(html.includes("Empowering Africa&#39;s Next Generation of Leaders Through Innovation and Collaboration — Foreign Africa (CMS Preview)"));
  // Check robots
  assert.ok(html.includes('<meta name="robots" content="noindex, nofollow">'));
  // Check preview banner
  assert.ok(html.includes('class="fa-preview-bar"'));
  assert.ok(html.includes('CMS PREVIEW'));
  assert.ok(html.includes('DRAFT'));
  assert.ok(html.includes('/admin#/content/news/18'));
  // Check preview data script
  assert.ok(html.includes('id="fa-preview-data"'));
  assert.ok(html.includes('window.__FA_PREVIEW_DATA__'));
  assert.ok(html.includes('empowering-africas-next-generation'));
  // Check prerendered article body
  assert.ok(html.includes('article-prerender'));
  assert.ok(html.includes('<p>Young Africans are developing innovative solutions.</p>'));
  // Body has preview class
  assert.ok(html.includes('class="has-preview-bar"'));
});

test('injectPreviewArticle includes View Live link only when published', () => {
  const draftItem = {
    id: 19,
    type: 'commentary',
    title: 'Draft commentary',
    slug: 'draft-commentary',
    status: 'draft',
    html: '<p>Draft</p>',
  };
  const publishedItem = {
    id: 20,
    type: 'commentary',
    title: 'Published commentary',
    slug: 'published-commentary',
    status: 'published',
    html: '<p>Published</p>',
  };

  const draftHtml = injectPreviewArticle(sampleShell, {publicSiteUrl: 'https://example.com'}, draftItem);
  assert.ok(!draftHtml.includes('View Live ↗'));

  const publishedHtml = injectPreviewArticle(sampleShell, {publicSiteUrl: 'https://example.com'}, publishedItem);
  assert.ok(publishedHtml.includes('View Live ↗'));
  assert.ok(publishedHtml.includes('/published-commentary/'));
});

test('resolvePage routes preview URLs when preview data is present', () => {
  globalThis.window = {
    __FA_PREVIEW_DATA__: {
      preview: true,
      item: {
        id: 18,
        type: 'news',
        slug: 'empowering-africas-next-generation',
      },
    },
  };

  const route = resolvePage('/api/staff/content/18/preview');
  assert.deepEqual(route, {
    type: 'news-article',
    slug: 'empowering-africas-next-generation',
    id: 18,
    preview: true,
  });

  delete globalThis.window;
});

test('assistEditorial returns friendly error when GEMINI_API_KEY is missing', async () => {
  const result = await assistEditorial({
    apiKey: '',
    action: 'improve',
    selectedText: 'Some draft text',
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'API_KEY_MISSING');
  assert.ok(result.error.includes('GEMINI_API_KEY is not configured'));
});

test('assistEditorial calls Gemini generateContent with correct system instructions and context', async () => {
  let capturedUrl = '';
  let capturedHeaders = {};
  let capturedBody = {};

  const mockFetch = async (url, options) => {
    capturedUrl = url;
    capturedHeaders = options.headers;
    capturedBody = JSON.parse(options.body);

    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{text: 'Young leaders across Africa are driving transformative innovation.'}],
            },
          },
        ],
        usageMetadata: {totalTokenCount: 120},
      }),
    };
  };

  const result = await assistEditorial({
    apiKey: 'test-fake-key-12345',
    model: 'gemini-1.5-flash',
    action: 'improve',
    selectedText: 'Kids in Africa are doing cool stuff.',
    context: {
      title: "Empowering Africa's Next Generation",
      type: 'news',
      category: 'Youth',
      body: 'Full article body here...',
    },
    fetchImpl: mockFetch,
  });

  assert.equal(result.ok, true);
  assert.equal(result.result, 'Young leaders across Africa are driving transformative innovation.');
  assert.equal(result.action, 'improve');
  assert.equal(result.responseKind, 'article_content');
  assert.ok(capturedUrl.includes('gemini-1.5-flash:generateContent'));
  assert.equal(capturedHeaders['x-goog-api-key'], 'test-fake-key-12345');
  assert.ok(capturedBody.systemInstruction.parts[0].text.includes('Foreign Africa Editorial Assistant'));
  assert.ok(capturedBody.contents[0].parts[0].text.includes('Kids in Africa are doing cool stuff.'));
});

test('parseAiContentToTiptapNodes converts Markdown headings, bold, lists, quotes, and links into valid Tiptap AST', () => {
  const md = [
    '## Regional Economic Integration',
    '',
    'Trade corridors across **West Africa** and *East Africa* are accelerating through [AfCFTA](https://au-afcfta.org).',
    '',
    '- Cross-border payments infrastructure',
    '- **Renewable energy** grid interconnections',
    '',
    '1. First priority area',
    '2. Second priority area',
    '',
    '> Regional cooperation requires sustained institutional commitment.',
  ].join('\n');

  const nodes = parseAiContentToTiptapNodes(md);
  assert.equal(nodes[0].type, 'heading');
  assert.equal(nodes[0].attrs.level, 2);
  assert.equal(nodes[0].content[0].text, 'Regional Economic Integration');

  assert.equal(nodes[1].type, 'paragraph');
  const boldNode = nodes[1].content.find((n) => n.text === 'West Africa');
  assert.ok(boldNode?.marks?.some((m) => m.type === 'bold'));
  const italicNode = nodes[1].content.find((n) => n.text === 'East Africa');
  assert.ok(italicNode?.marks?.some((m) => m.type === 'italic'));
  const linkNode = nodes[1].content.find((n) => n.text === 'AfCFTA');
  assert.ok(linkNode?.marks?.some((m) => m.type === 'link' && m.attrs.href === 'https://au-afcfta.org'));

  assert.equal(nodes[2].type, 'bulletList');
  assert.equal(nodes[2].content.length, 2);

  assert.equal(nodes[3].type, 'orderedList');
  assert.equal(nodes[3].content.length, 2);

  assert.equal(nodes[4].type, 'blockquote');

  // Verify backend normalizeDocument accepts the generated Tiptap AST and preserves structure
  const normalized = normalizeDocument({type: 'doc', content: nodes});
  const renderedHtml = documentHtml(normalized);
  assert.ok(renderedHtml.includes('<h2>Regional Economic Integration</h2>'));
  assert.ok(renderedHtml.includes('<strong>West Africa</strong>'));
  assert.ok(renderedHtml.includes('<em>East Africa</em>'));
  assert.ok(renderedHtml.includes('<ul>'));
  assert.ok(renderedHtml.includes('<ol>'));
  assert.ok(renderedHtml.includes('<blockquote>'));
});

test('parseAiContentToTiptapNodes strips raw HTML tags and converts HTML-formatted suggestions cleanly', () => {
  const rawHtml = `\`\`\`html
<h3>Strategic Implications for the Sahel</h3>
<p>Policy coordination between <strong>regional blocs</strong> and <em>multilateral lenders</em> remains essential.</p>
<ul>
  <li><strong>Governance:</strong> Strengthening local administrative capacity.</li>
  <li><strong>Security:</strong> Coordinated border management.</li>
</ul>
\`\`\``;

  const nodes = parseAiContentToTiptapNodes(rawHtml);
  const plain = aiNodesToPlainText(nodes);

  // Zero raw HTML or markdown fence artifacts in plain text or node text
  assert.ok(!plain.includes('<h3>'));
  assert.ok(!plain.includes('<p>'));
  assert.ok(!plain.includes('<strong>'));
  assert.ok(!plain.includes('```'));

  assert.equal(nodes[0].type, 'heading');
  assert.equal(nodes[0].attrs.level, 3);
  assert.equal(nodes[0].content[0].text, 'Strategic Implications for the Sahel');
  assert.equal(nodes[1].type, 'paragraph');
  assert.equal(nodes[2].type, 'bulletList');
});

test('normalizeRawAiText and aiNodesToSafeHtml neutralize XSS and script injection payloads', () => {
  const malicious = `<script>alert("xss")</script><h3>Safe Heading</h3><p onclick="evil()">Text with <a href="javascript:alert(1)">bad link</a> and <iframe src="https://evil.example"></iframe></p>`;
  const cleaned = normalizeRawAiText(malicious);
  assert.ok(!cleaned.includes('<script'));
  assert.ok(!cleaned.includes('alert("xss")'));
  assert.ok(!cleaned.includes('<iframe'));

  const nodes = parseAiContentToTiptapNodes(malicious);
  const safeHtml = aiNodesToSafeHtml(nodes);
  assert.ok(!safeHtml.includes('<script'));
  assert.ok(!safeHtml.includes('javascript:'));
  assert.ok(!safeHtml.includes('onclick'));
  assert.ok(safeHtml.includes('<h3>Safe Heading</h3>'));
});

test('classifyResponseKind and extractStructuredMetadata handle headlines, SEO, tags, and analysis', () => {
  assert.equal(classifyResponseKind('draft', ''), 'article_content');
  assert.equal(classifyResponseKind('improve', ''), 'article_content');
  assert.equal(classifyResponseKind('headlines', ''), 'metadata');
  assert.equal(classifyResponseKind('grammar', ''), 'analysis');
  assert.equal(classifyResponseKind('custom', 'What is the main argument of this article?'), 'conversation');

  const headlinesMeta = extractStructuredMetadata(
    'headlines',
    '1. **Ghana’s BRICS Ambitions and the New Non-Alignment**\n2. Why Accra Is Looking East for Development Finance\n3. West Africa’s Multipolar Diplomacy in Practice',
  );
  assert.equal(headlinesMeta.headlines.length, 3);
  assert.equal(headlinesMeta.headlines[0], 'Ghana’s BRICS Ambitions and the New Non-Alignment');

  const seoMeta = extractStructuredMetadata(
    'seo',
    'SEO Title: Ghana’s BRICS Strategy Explained\nMeta Description: An institutional analysis of Ghana’s foreign policy diversification and trade diplomacy.',
  );
  assert.equal(seoMeta.seoTitle, 'Ghana’s BRICS Strategy Explained');
  assert.ok(seoMeta.seoDescription.includes('institutional analysis'));

  const tagsMeta = extractStructuredMetadata(
    'tags',
    'Category: Diplomacy\nTags: BRICS, Ghana, West Africa, Trade Policy, Multilateralism',
  );
  assert.equal(tagsMeta.category, 'Diplomacy');
  assert.deepEqual(tagsMeta.tags, ['BRICS', 'Ghana', 'West Africa', 'Trade Policy', 'Multilateralism']);
});
