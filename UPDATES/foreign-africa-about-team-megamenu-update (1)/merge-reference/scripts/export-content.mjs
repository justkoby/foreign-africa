// Portable draft handoff for the future CMS. Run from the repository root.
import {writeFileSync} from 'node:fs';
import {activities} from '../src/activities.js';
import {heroSlides} from '../src/hero-content.js';
import {teamMembers} from '../src/pages/team-content.js';
import {aboutContent} from '../src/pages/about-content.js';
import {interns} from '../src/people.js';
const items=[{kind:'about',slug:'who-we-are',position:0,payload:aboutContent},...teamMembers.map((payload,position)=>({kind:'person',slug:payload.id,position,payload})),...activities.map((payload,position)=>({kind:'news',slug:payload.id,position,payload})),...heroSlides.map(payload=>({kind:'hero',slug:payload.id,position:Math.round(payload.order*100),payload})),...interns.map(payload=>({kind:'person',slug:payload.id,position:payload.order,payload:{...payload,group:'associates'}}))];
writeFileSync('supabase/content-seed.json',JSON.stringify(items.map(i=>({...i,status:'draft'})),null,2)+'\n');
