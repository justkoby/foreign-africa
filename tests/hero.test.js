import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {heroSlides,publishedSlides,mediaForViewport,nextSlideIndex,youtubeEmbedUrl} from '../src/hero-content.js';
test('mobile media is optional and always falls back to main asset',()=>{
 assert.equal(mediaForViewport(heroSlides[0],true),heroSlides[0].desktopMedia);
 assert.equal(mediaForViewport(heroSlides.find(s=>s.id==='startup-workshop'),true).src,'/images/hero/startups-mobile.jpg');
 assert.equal(mediaForViewport(heroSlides.find(s=>s.id==='meet-interns'),false).src,'/images/hero/interns-desktop.jpg');
 assert.equal(mediaForViewport({...heroSlides.find(s=>s.id==='startup-workshop'),mobileMedia:{}},true),heroSlides.find(s=>s.id==='startup-workshop').desktopMedia);
});
test('published slides can be ordered and hidden without mutating the original list',()=>{
 const input=[{id:'a',order:2,published:true},{id:'b',order:0,published:false},{id:'c',order:1,published:true}];
 assert.deepEqual(publishedSlides(input).map(s=>s.id),['c','a']);assert.equal(input[0].id,'a');
});
test('manual and swipe navigation wrap in both directions',()=>{
 assert.equal(nextSlideIndex(0,-1,3),2);assert.equal(nextSlideIndex(2,1,3),0);assert.equal(nextSlideIndex(0,1,0),0);
});
test('all local media assets exist and historic workshop is not presented as open',()=>{
 for(const s of heroSlides)for(const m of [s.desktopMedia,s.mobileMedia].filter(Boolean))for(const path of [m.src,m.poster].filter(p=>p?.startsWith('/')))assert.ok(existsSync(`public${path}`),path);
 assert.match(heroSlides.find(s=>s.id==='startup-workshop').label,/Past workshop/);assert.doesNotMatch(heroSlides.find(s=>s.id==='startup-workshop').cta.label,/register|apply/i);
});
test('future YouTube recordings use an allowlisted embed URL',()=>{
 assert.equal(youtubeEmbedUrl('https://www.youtube.com/watch?v=abcdefghijk'),'https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=1&rel=0');
 assert.equal(youtubeEmbedUrl('https://youtu.be/abcdefghijk'),'https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=1&rel=0');
 for(const url of ['https://evil.example/watch?v=abcdefghijk','javascript:alert(1)','https://www.youtube.com/watch?v=short'])assert.equal(youtubeEmbedUrl(url),null);
});
test('website source uses SVG icon components rather than emoji pictographs',()=>{
 for(const name of ['main.jsx','Hero.jsx','DiscoveryDialog.jsx'])assert.doesNotMatch(readFileSync(`src/${name}`,'utf8').replace(/[©®™]/g,''),/\p{Extended_Pictographic}/u);
});
