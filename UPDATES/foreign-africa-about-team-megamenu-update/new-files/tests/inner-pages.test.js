import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {resolvePage,teamGroups,personUrl} from '../src/pages/routes.js';
import {teamMembers,getMember,additionalTeamMembers} from '../src/pages/team-content.js';
import {megaGroups} from '../src/menu-content.js';
import {discover} from '../src/discovery.js';
test('legacy About and all supplied people groups have local routes',()=>{
 for(const p of ['/about-us/','/who-we-are','/our-mission-vision/'])assert.equal(resolvePage(p).type,'about');
 for(const g of teamGroups)assert.equal(resolvePage(g.path).group,g.id);
 assert.equal(resolvePage('/'),null);assert.equal(resolvePage('/unknown'),null);
 for(const member of teamMembers){const route=resolvePage(personUrl(member.id));assert.equal(getMember(route.id),member);assert.ok(existsSync('public'+member.image));assert.ok(member.bio.length>=3)}
 assert.equal(additionalTeamMembers.length,3);assert.ok(additionalTeamMembers.every(m=>!m.bio&&!m.email&&!m.image));
});
test('mega menu local destinations resolve or point to existing homepage anchors',()=>{
 for(const group of megaGroups){for(const [,href] of group.columns.flatMap(c=>c.links)){if(href.startsWith('/')&&!href.startsWith('/#')&&!href.startsWith('/?'))assert.ok(resolvePage(href.split('#')[0]),href)}}
});
test('discovery includes names, accented surnames, biographies and groups',()=>{
 assert.equal(discover('Elorm','People').results[0].url,personUrl('elorm-mawuli-kwawu'));
 assert.equal(discover('Agbenyiga','People').results[0].url,personUrl('debrenna-lafa-agbenyiga'));
 assert.equal(discover('Advisory Council','People').results[0].url,'/advisory-council/');
 assert.equal(discover('values','About').results[0].url,'/who-we-are/');
});

test('complete supplied executive and Secretariat profiles keep their correct groups and contacts',()=>{
 assert.equal(teamMembers.filter(m=>m.group==='executive').length,5);
 assert.equal(teamMembers.filter(m=>m.group==='secretariat').length,2);
 assert.equal(getMember('rexford-akrong').location,'Remote');
 assert.equal(getMember('nana-osei-agyekum').phone,'+233508856389');
 assert.equal(getMember('emmanuel-nuvi-junior').email,undefined);
 assert.equal(resolvePage('/secretariat/').group,'secretariat');
 assert.ok(additionalTeamMembers.every(m=>m.group==='secretariat'));
});
