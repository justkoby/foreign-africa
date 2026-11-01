import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {commentaries,commentaryUrl} from '../src/pages/commentaries-content.js';
import {resolvePage} from '../src/pages/routes.js';
import {internshipProgramme,opportunityFaqs} from '../src/pages/opportunities-content.js';
import {megaGroups} from '../src/menu-content.js';
import {innerPageDirectory} from '../src/pages/page-directory.js';
const walk=nodes=>nodes.flatMap(node=>typeof node==='string'?[]:[node,...walk(node.children??[])]);

test('each commentary opens a local full article from archive, aliases and discovery',()=>{
 for(const item of commentaries){
  const expected={type:'commentary',id:item.id,slug:item.slug};
  assert.deepEqual(resolvePage(commentaryUrl(item)),expected);
  assert.deepEqual(resolvePage(`/blog/${item.slug}/`),expected);
  assert.deepEqual(resolvePage(`/${item.slug}`),expected);
  assert.equal(innerPageDirectory.find(page=>page.id===`commentary-${item.id}`).url,commentaryUrl(item));
  const data=JSON.parse(readFileSync(`public/content/commentaries/${item.id}.json`));
  assert.equal(data.id,item.id);assert.equal(data.sourceUrl,item.sourceUrl);
  const nodes=walk(data.content);
  assert.ok(nodes.filter(node=>node.tag==='p').length>=10,`Full body missing for ${item.id}`);
  for(const node of nodes){
   assert.ok(!['script','iframe','form','style','div'].includes(node.tag));
   if(node.tag==='img'){
    assert.ok(node.src.startsWith('/images/commentaries/inline/'));
    assert.ok(existsSync(`public${node.src}`));
    assert.ok(node.width>0&&node.height>0);
   }
   if(node.tag==='a'&&node.href)assert.match(node.href,/^(https?:\/\/|mailto:|\/|#)/);
  }
 }
});

test('every Opportunities menu destination is built in, including the internship FAQ',()=>{
 const links=megaGroups.find(group=>group.id==='opportunities').columns.flatMap(column=>column.links);
 for(const [title,url] of links){assert.ok(url.startsWith('/'),title);assert.ok(resolvePage(url),title)}
 assert.deepEqual(resolvePage(internshipProgramme.path),{type:'opportunity',id:'internship'});
 assert.equal(opportunityFaqs.find(item=>item.href?.includes('internship')).href,internshipProgramme.path);
 assert.equal(internshipProgramme.formId,null);
 assert.equal(internshipProgramme.listingState,'overview');
 assert.ok(!internshipProgramme.applicationUrl&&!internshipProgramme.deadline);
});
