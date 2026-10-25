import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {commentaries} from '../src/pages/commentaries-content.js';
import {findCommentaries,commentaryDate,commentaryTopics} from '../src/pages/commentaries-search.js';
import {resolvePage} from '../src/pages/routes.js';
import {discover} from '../src/discovery.js';

test('archive search combines topic, year, keywords and author names',()=>{
  assert.deepEqual(findCommentaries({query:'Ghana',topic:'Diplomacy',year:'2026'}).map(a=>a.id),['7321']);
  assert.deepEqual(findCommentaries({query:'Hildana Mesai'}).map(a=>a.id),['6697']);
  assert.deepEqual(findCommentaries({query:'Cote Ivoire'}).map(a=>a.id),['6707']);
  assert.equal(findCommentaries({query:'nonexistent-topic-123456789'}).length,0);
  assert.equal(findCommentaries({topic:'Energy',year:'2025'}).length,0);
});

test('ordering is chronological and leaves the source catalogue intact',()=>{
  const before=commentaries.map(a=>a.id);
  const newest=findCommentaries(),oldest=findCommentaries({sort:'oldest'});
  assert.equal(newest[0].id,'7321');
  assert.equal(oldest[0].id,'6715');
  assert.deepEqual(oldest.map(a=>a.id),newest.map(a=>a.id).reverse());
  assert.deepEqual(commentaries.map(a=>a.id),before);
  assert.equal(commentaryDate('2026-10-12'),'12 Oct 2026');
});

test('all imported commentaries preserve published destinations and local images',()=>{
  assert.equal(commentaries.length,12);
  assert.equal(new Set(commentaries.map(a=>a.id)).size,12);
  for(const item of commentaries){
    const source=new URL(item.sourceUrl);
    assert.equal(source.hostname,'foreignafrica.org');
    assert.equal(source.pathname,`/${item.slug}/`);
    assert.ok(existsSync(`public${item.image}`));
    assert.ok(item.authors.length&&item.title&&item.summary&&item.readMinutes>0);
    assert.ok(commentaryTopics.includes(item.topic));
    assert.match(item.date,/^\d{4}-\d{2}-\d{2}$/);
  }
  assert.deepEqual(commentaries.find(a=>a.id==='7067').authors,['Gwendoline Nuonzie','Elorm Mawuli-Kwawu']);
});

test('blog aliases and discovery connect visitors to the correct archive and articles',()=>{
  for(const path of ['/blog/','/blog','/commentaries/','/category/blog/'])assert.equal(resolvePage(path).type,'commentaries');
  assert.equal(discover('BRICS','Research').results[0].url,commentaries[0].sourceUrl);
});
