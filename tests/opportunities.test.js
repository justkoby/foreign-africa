import test from 'node:test';
import assert from 'node:assert/strict';
import {opportunityPathways,enquiryHref} from '../src/pages/opportunities-content.js';
import {resolvePage} from '../src/pages/routes.js';
import {resources} from '../src/content.js';
import {megaGroups} from '../src/menu-content.js';
import {discover} from '../src/discovery.js';

test('the opportunities hub and every legacy pathway URL resolve locally',()=>{
  assert.equal(resolvePage('/opportunities/').type,'opportunities');
  assert.equal(new Set(opportunityPathways.map(item=>item.path)).size,4);
  for(const item of opportunityPathways){
    assert.deepEqual(resolvePage(item.path),{type:'opportunity',id:item.id});
    assert.deepEqual(resolvePage(item.path.slice(0,-1)),{type:'opportunity',id:item.id});
    assert.equal(new URL(item.sourceUrl).pathname,item.path);
  }
  assert.equal(resolvePage('/foreign-africa-enterprise-week-few/').id,'enterprise-week');
});

test('pathway actions are editable email enquiries and contain no application destination',()=>{
  for(const item of opportunityPathways){
    const href=new URL(enquiryHref(item));
    assert.equal(href.protocol,'mailto:');
    assert.equal(href.pathname,'info@foreignafrica.org');
    assert.equal(href.searchParams.get('subject'),item.subject);
    assert.equal(item.applicationUrl,undefined);
    assert.equal(item.registrationUrl,undefined);
    assert.equal(item.deadline,undefined);
    assert.equal(item.listingState,'overview');
  }
});

test('navigation and resource entries preserve all four pathways and internship information',()=>{
  const links=megaGroups.find(group=>group.id==='opportunities').columns.flatMap(c=>c.links).map(([,href])=>href);
  assert.ok(links.includes('/opportunities/'));
  for(const item of opportunityPathways){
    assert.ok(links.includes(item.path));
    assert.ok(resources.some(resource=>resource.type==='Opportunity'&&resource.url===item.path));
  }
  assert.ok(links.includes('https://foreignafrica.org/remote-internship-programme-rip/'));
});

test('discovery connects to opportunity overviews without asserting availability',()=>{
  for(const query of ['fellowships','volunteer','papers','Enterprise Week']){
    const found=discover(query,'Opportunity');
    assert.ok(found.results.length,query);
    assert.ok(found.results.every(item=>item.status==='unverified'));
    assert.match(found.notice,/not been verified/);
    assert.ok(found.results.some(item=>item.url.startsWith('/')));
  }
});
