import test from 'node:test';
import assert from 'node:assert/strict';
import {engageServices,contactDepartments,archivedVacancies,createEnquiryDraft,draftErrors} from '../src/pages/engage-content.js';
import {resolvePage} from '../src/pages/routes.js';
import {page} from '../src/content.js';
import {megaGroups} from '../src/menu-content.js';

test('all five Engage items and the overview resolve locally, including shared CTA helpers',()=>{
 for(const [path,type] of [['/engage/','engage'],['/contact/','contact'],['/careers/','careers']])assert.equal(resolvePage(path).type,type);
 for(const item of engageServices){assert.deepEqual(resolvePage(item.path),{type:'engage-service',id:item.id});assert.equal(page(item.path.split('/')[1]),item.path);assert.equal(item.formId,null)}
 const links=megaGroups.find(group=>group.id==='engage').columns.flatMap(column=>column.links).map(([,href])=>href);
 for(const path of ['/engage/','/contact/','/careers/',...engageServices.map(item=>item.path)])assert.ok(links.includes(path));
 assert.equal(page('contact'),'/contact/');
 assert.equal(page('remote-internship-programme-rip'),'/remote-internship-programme-rip/');
});

test('email drafts safely encode enquiry text and restrict recipients/topics',()=>{
 const draft=createEnquiryDraft('speaker',{name:'Example User',email:'user@example.com',organisation:'Arts & Policy',message:'Line one\nIs A+B = C? #question'});
 const url=new URL(draft.href);
 assert.equal(url.protocol,'mailto:');assert.equal(url.pathname,'info@foreignafrica.org');
 assert.equal(url.searchParams.get('subject'),'Speaker request — Foreign Africa');
 assert.equal(url.searchParams.get('body'),draft.body);
 assert.ok(draft.body.includes('Arts & Policy'));
 assert.ok(draft.body.includes('Line one\nIs A+B = C? #question'));
 assert.equal(createEnquiryDraft('unknown').subject,'General enquiry — Foreign Africa');
 assert.deepEqual(draftErrors({name:'Example',email:'user@example.com',message:'Hello'}),{});
 assert.equal(Object.keys(draftErrors({name:' ',email:'invalid',message:''})).length,3);
});

test('published contact addresses retain their exact source spellings',()=>{
 const emails=contactDepartments.flatMap(department=>department.emails);
 assert.deepEqual(emails,['info@foreignafrica.org','founder@foreignafricalgb.onmicrosoft.com','operations@foreignafrica.lgb.onmicrosoft.com','abla@foreignafrica.lgb.onmicrosoft.com']);
 assert.equal(new Set(emails).size,4);
});

test('the stale Careers search result is preserved as expired without an application CTA',()=>{
 assert.equal(archivedVacancies.length,1);
 const role=archivedVacancies[0];assert.equal(role.title,'Institutional Partnerships Officer (IPO)');
 assert.equal(role.status,'expired');assert.equal(role.applicationUrl,undefined);
 const url=new URL(role.sourceUrl);assert.equal(url.searchParams.get('p'),'7310');
});
