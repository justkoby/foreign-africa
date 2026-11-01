import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {events,eventUrl} from '../src/pages/events-content.js';
import {newsItems} from '../src/pages/news-content.js';
import {filterNews,eventState,listEvents} from '../src/pages/news-events-model.js';
import {resolvePage} from '../src/pages/routes.js';
import {opportunityPathways} from '../src/pages/opportunities-content.js';

test('event states respect exact GMT boundaries and date-only announcements',()=>{
 const event=events.find(item=>item.id==='edws-funding-your-startup');
 assert.equal(eventState(event,new Date('2026-06-26T14:59:59Z')),'upcoming');
 assert.equal(eventState(event,new Date('2026-06-26T15:00:00Z')),'ongoing');
 assert.equal(listEvents([event],'upcoming',new Date('2026-06-26T15:30:00Z')).length,1);
 assert.equal(eventState(event,new Date('2026-06-26T16:30:00Z')),'past');
 assert.equal(eventState({...event,cancelled:true},new Date('2026-06-01')),'cancelled');
 assert.equal(eventState({date:null}),'unannounced');
 assert.equal(eventState(events[0],new Date('2026-10-24T00:00:00Z')),'past');
 const now=new Date('2026-10-25T12:00:00Z');
 assert.equal(listEvents(events,'upcoming',now).length,0);
 assert.equal(listEvents(events,'past',now).length,3);
});

test('news filtering uses publication dates while preserving source destinations',()=>{
 assert.equal(newsItems.length,5);
 assert.equal(filterNews({query:'Rwanda'})[0].id,'7277');
 assert.equal(filterNews({category:'Community'}).length,2);
 assert.equal(filterNews({query:'nonsense-unlisted-4567'}).length,0);
 const conference=newsItems.find(item=>item.id==='6184');
 assert.equal(conference.publishedOn,'2026-02-01');
 assert.match(conference.summary,/October 2025/);
 for(const item of newsItems){assert.ok(existsSync('public'+item.image));assert.equal(new URL(item.sourceUrl).hostname,'foreignafrica.org')}
});

test('all event pages and archive routes resolve and have complete local media',()=>{
 for(const path of ['/news/','/news-events/'])assert.equal(resolvePage(path).type,'news');
 assert.equal(resolvePage('/events/').type,'events');
 for(const item of events){
   assert.deepEqual(resolvePage(eventUrl(item)),{type:'event',id:item.id});
   assert.ok(existsSync('public'+item.image));
   assert.equal(item.registrationState,'unavailable');
   assert.equal(item.formId,null);
 }
});

test('future CMS forms have a constrained builder contract without enabling real forms',()=>{
 const schema=JSON.parse(readFileSync('cms/form-definition.schema.json','utf8'));
 assert.deepEqual(schema.properties.purpose.enum,['fellowship_application','internship_application','paper_submission','volunteer_interest','event_registration','partnership_enquiry','sponsorship_enquiry','speaker_request','general_enquiry','job_application']);
 assert.equal(schema.additionalProperties,false);
 assert.equal(schema.properties.fields.items.additionalProperties,false);
 assert.ok(schema.required.includes('consentLabel'));
 for(const item of opportunityPathways){assert.equal(item.formId,null);assert.equal(item.actionMode,'enquiry')}
 assert.ok(readFileSync('docs/cms-handoff.md','utf8').includes('cursor-cms-forms-spec.md'));
});
