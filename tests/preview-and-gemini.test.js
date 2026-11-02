import test from 'node:test';
import assert from 'node:assert/strict';
import {injectPreviewArticle} from '../server/html.js';
import {assistEditorial} from '../server/gemini-service.js';
import {resolvePage} from '../src/pages/routes.js';

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
  // Simulate window.__FA_PREVIEW_DATA__
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

  // Clean up global
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
  assert.ok(capturedUrl.includes('gemini-1.5-flash:generateContent'));
  assert.equal(capturedHeaders['x-goog-api-key'], 'test-fake-key-12345');
  assert.ok(capturedBody.systemInstruction.parts[0].text.includes('Foreign Africa Editorial Assistant'));
  assert.ok(capturedBody.contents[0].parts[0].text.includes('Kids in Africa are doing cool stuff.'));
});
