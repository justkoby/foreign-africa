import test from 'node:test';
import assert from 'node:assert/strict';
import {documentHtml, documentText, editorialDocument, normalizeDocument, plainDocument} from '../server/document.js';
import {injectArticle, renderContentPage} from '../server/html.js';

test('plain text becomes paragraphs and script text is escaped', () => {
  const document = normalizeDocument('Hello\n\n<script>alert(1)</script>');
  const html = documentHtml(document);
  assert.match(html, /<p>Hello<\/p>/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.equal(documentText(document).includes('Hello'), true);
});

test('an unknown block is rejected and a library image is kept', () => {
  assert.throws(() => normalizeDocument({type: 'doc', content: [{type: 'script'}]}), /not allowed/);
  const document = normalizeDocument({type: 'doc', content: [{type: 'image', attrs: {src: '/images/news/7277.webp', alt: 'Mission', caption: 'Addis'}}]});
  assert.match(documentHtml(document), /<figcaption>Addis<\/figcaption>/);
  assert.throws(() => normalizeDocument({type: 'doc', content: [{type: 'image', attrs: {src: 'https://evil.example/a.png'}}]}), /media library/);
});

test('a legacy text document and editorial nodes stay readable', () => {
  const legacy = normalizeDocument({text: 'First\n\nSecond'});
  assert.equal(documentHtml(legacy), '<p>First</p><p>Second</p>');
  const editorial = editorialDocument([{tag: 'p', children: ['Keep ', {tag: 'a', href: 'https://foreignafrica.org/blog/', children: ['this']}]}, {tag: 'strong', children: ['no']}], []);
  assert.match(documentHtml(editorial), /href="https:\/\/foreignafrica.org\/blog\/"/);
  assert.equal(plainDocument('').content.length, 0);
});

test('the public shell contains the article before JavaScript runs', () => {
  const shell = '<!doctype html><html><head><title>Old</title><meta name="description" content="Old"></head><body><div id="root"></div></body></html>';
  const item = {type: 'commentary', slug: 'ghana-brics', title: 'Ghana’s BRICS ambitions', summary: 'A question.', seoTitle: '', seoDescription: '', authorName: 'Elorm Mawuli-Kwawu', html: '<p>On 6 October 2026, Foreign Minister Samuel Okudzeto Ablakwa announced the plan.</p>', image: '/images/commentaries/7321.webp', publishedAt: '2026-10-12 12:00:00.000'};
  const html = injectArticle(shell, {appEnv: 'production', publicSiteUrl: 'https://foreignafrica.org'}, item);
  assert.match(html, /On 6 October 2026/);
  assert.match(html, /rel="canonical" href="https:\/\/foreignafrica.org\/ghana-brics\/"/);
  assert.match(html, /og:image/);
  assert.match(html, /Elorm Mawuli-Kwawu/);
  assert.doesNotMatch(renderContentPage({appEnv: 'staging', publicSiteUrl: 'https://preview.foreignafrica.org'}, {...item, content_type: 'commentary'}), /index,follow/);
});
