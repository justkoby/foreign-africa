import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {activities,getStory,storyUrl} from '../src/activities.js';
import {discover} from '../src/discovery.js';
test('every activity has a resolvable local story URL and evidence provenance',()=>{
 for(const story of activities){assert.equal(getStory(new URL(storyUrl(story.id),'https://foreignafrica.org').searchParams.get('story')),story);assert.ok(story.sourceFiles.length);assert.ok(story.paragraphs.length);for(const p of [story.photo,...(story.gallery??[])])assert.ok(existsSync(`public${p.src}`))}
 assert.equal(getStory('unknown-story'),undefined);
});
test('discovery retrieves actual mission updates by place and speaker rather than generic directory matches',()=>{
 assert.equal(discover('Kigali mission','Update').results[0].id,'update-kigali-engagement');
 assert.ok(discover('Addis Ababa UNDP','Update').results.some(r=>r.id==='update-addis-engagement'));
 assert.equal(discover('Beyond the Logo','Update').results[0].id,'update-beyond-the-logo');
});
