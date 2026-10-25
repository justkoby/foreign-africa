import test from 'node:test';
import assert from 'node:assert/strict';
import {resources,searchResources} from '../src/content.js';
test('search supports case-insensitive words and category filtering',()=>{assert.equal(searchResources('  REMOTE internship ')[0].title,'Remote Internship Programme');assert.equal(searchResources('policy','Opportunity').length,0);assert.equal(searchResources('','Research').length,2)});
test('blank search lists all content; unmatched input returns no entries',()=>{assert.equal(searchResources(' ').length,resources.length);assert.deepEqual(searchResources('not-a-real-programme'),[])});
test('all resource links preserve the current Foreign Africa domain',()=>{for(const r of resources){assert.equal(new URL(r.url).hostname,'foreignafrica.org');assert.ok(r.title&&r.description&&r.type)}});
