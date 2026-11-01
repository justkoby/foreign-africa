import test from 'node:test';
import assert from 'node:assert/strict';
import {documentHtml, documentText, normalizeDocument} from '../server/document.js';
import {youtubeId} from '../server/embeds.js';

const cell = (text, type = 'tableCell', attrs) => ({type, ...(attrs ? {attrs} : {}), content: [{type: 'paragraph', content: [{type: 'text', text}]}]});
const doc = (...content) => ({type: 'doc', content});

test('approved YouTube links reduce to an id; everything else is refused', () => {
  const id = 'dQw4w9WgXcQ';
  for (const ok of [`https://www.youtube.com/watch?v=${id}`, `https://youtube.com/watch?v=${id}&t=10s`, `https://youtu.be/${id}?si=x`, `https://www.youtube.com/embed/${id}`, `https://www.youtube.com/shorts/${id}`, `https://m.youtube.com/watch?v=${id}`, `https://www.youtube-nocookie.com/embed/${id}`, `  https://youtu.be/${id}  `]) assert.equal(youtubeId(ok), id, ok);
  for (const bad of ['', 'dQw4w9WgXcQ', 'javascript:alert(1)', 'data:text/html,<script>', `https://evil.example/watch?v=${id}`, `https://youtube.com.evil.example/watch?v=${id}`, `https://evil.example/https://youtube.com/watch?v=${id}`, 'https://www.youtube.com/watch?v=short', `https://www.youtube.com/watch?v=${id}x`, `https://user:pw@www.youtube.com/watch?v=${id}`, `ftp://youtube.com/watch?v=${id}`, 'https://vimeo.com/12345678901', 'https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx']) assert.equal(youtubeId(bad), '', bad);
});

test('a video node keeps only the id and renders a privacy-friendly iframe built on the server', () => {
  const clean = normalizeDocument(doc({type: 'video', attrs: {url: 'https://youtu.be/dQw4w9WgXcQ', src: 'https://evil.example/x', onload: 'alert(1)', title: 'Talk <b>', caption: 'A "caption"'}}));
  assert.deepEqual(clean.content[0].attrs, {provider: 'youtube', videoId: 'dQw4w9WgXcQ', title: 'Talk <b>', caption: 'A "caption"'});
  const html = documentHtml(clean);
  assert.match(html, /<iframe src="https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ"/);
  assert.ok(!html.includes('evil.example') && !html.includes('onload') && !html.includes('<b>'));
  assert.throws(() => normalizeDocument(doc({type: 'video', attrs: {url: 'https://evil.example/watch?v=dQw4w9WgXcQ'}})), /YouTube/);
  assert.throws(() => normalizeDocument(doc({type: 'video', attrs: {videoId: '<script>alert(1)'}})), /YouTube/);
  assert.match(documentText(clean), /Talk/);
});

test('tables are validated, bounded and rendered with a header row and responsive wrapper', () => {
  const table = {type: 'table', content: [
    {type: 'tableRow', content: [cell('Country', 'tableHeader'), cell('Value', 'tableHeader')]},
    {type: 'tableRow', content: [cell('Ghana'), cell('1 < 2', 'tableCell', {colspan: 2, rowspan: 1, colwidth: [100]})]},
  ]};
  const clean = normalizeDocument(doc(table));
  assert.equal(clean.content[0].content[1].content[1].attrs.colspan, 2);
  assert.ok(!('colwidth' in clean.content[0].content[1].content[1].attrs));
  const html = documentHtml(clean);
  assert.match(html, /^<div class="article-table"><table><thead><tr><th scope="col">/);
  assert.match(html, /<td colspan="2"><p>1 &lt; 2<\/p><\/td>/);
  assert.ok(!html.includes('1 < 2'));
  assert.match(documentText(clean), /Country Value Ghana 1 < 2/);
});

test('invalid or oversized tables are refused', () => {
  const row = n => ({type: 'tableRow', content: Array.from({length: n}, () => cell('x'))});
  assert.throws(() => normalizeDocument(doc({type: 'table', content: []})), /rows/);
  assert.throws(() => normalizeDocument(doc({type: 'table', content: [{type: 'paragraph'}]})), /not valid/);
  assert.throws(() => normalizeDocument(doc({type: 'table', content: [{type: 'tableRow', content: [{type: 'paragraph'}]}]})), /not valid/);
  assert.throws(() => normalizeDocument(doc({type: 'table', content: [row(21)]})), /cells/);
  assert.throws(() => normalizeDocument(doc({type: 'table', content: Array.from({length: 101}, () => row(1))})), /rows/);
  assert.throws(() => normalizeDocument(doc({type: 'tableRow', content: []})), /not valid/);
  assert.throws(() => normalizeDocument(doc({type: 'table', content: [{type: 'tableRow', content: [{type: 'tableCell', content: [{type: 'table', content: [row(1)]}]}]}]})), /inside tables/);
  const big = Array.from({length: 60}, () => row(20));
  assert.throws(() => normalizeDocument(doc({type: 'table', content: big})), /too large/);
  const clamp = normalizeDocument(doc({type: 'table', content: [{type: 'tableRow', content: [cell('a', 'tableCell', {colspan: 9999, rowspan: -4})]}]}));
  assert.deepEqual(clamp.content[0].content[0].content[0].attrs, {colspan: 20, rowspan: 1});
  assert.deepEqual(normalizeDocument(doc({type: 'table', content: [{type: 'tableRow', content: [{type: 'tableCell', content: []}]}]})).content[0].content[0].content[0].content, [{type: 'paragraph'}]);
});

test('existing documents are unchanged by the new block types', () => {
  const old = doc({type: 'heading', attrs: {level: 2}, content: [{type: 'text', text: 'Hello'}]}, {type: 'paragraph', content: [{type: 'text', text: 'World', marks: [{type: 'bold'}]}]}, {type: 'image', attrs: {src: '/media/3', alt: 'a', caption: 'c'}});
  assert.equal(documentHtml(normalizeDocument(old)), '<h2>Hello</h2><p><strong>World</strong></p><figure><img src="/media/3" alt="a"><figcaption>c</figcaption></figure>');
});

test('table cells hold text and lists only', () => {
  const inCell = node => doc({type: 'table', content: [{type: 'tableRow', content: [{type: 'tableCell', content: [node]}]}]});
  for (const node of [{type: 'video', attrs: {videoId: 'dQw4w9WgXcQ'}}, {type: 'image', attrs: {src: '/media/1'}}, {type: 'heading', attrs: {level: 2}}, {type: 'blockquote'}, {type: 'horizontalRule'}]) assert.throws(() => normalizeDocument(inCell(node)), /only contain text and lists/, node.type);
  const ok = normalizeDocument(inCell({type: 'bulletList', content: [{type: 'listItem', content: [{type: 'paragraph', content: [{type: 'text', text: 'a'}]}]}]}));
  assert.match(documentHtml(ok), /<td><ul><li>a<\/li><\/ul><\/td>/);
});
