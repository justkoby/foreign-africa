import {innerPageDirectory} from './pages/page-directory.js';
import {resources} from './content.js';
import {activities,storyUrl} from './activities.js';
const stop = new Set('a an and are as at be by can could do does for foreign africa from give have help how i im in interested is it like looking me my of on or our please related say show some tell that the their them there these this to want we what whats when where which who with would you your'.split(' '));
const topics = {
 leadership:['leadership','leader','leaders','team','people','council','advisory','executive','chair'],
 enterprise:['enterprise','entrepreneur','entrepreneurship','startup','startups','business','businesses','funding','budget','budgeting'],
 diplomacy:['diplomacy','diplomatic','international','embassy','embassies'],
 trade:['trade','trading','export','exports','investment','markets'],
 jobs:['jobs','job','employment','employ','workforce'],
 learning:['learn','learning','skills','skill','training','workshop','workshops','course','courses'],
 research:['research','report','reports','paper','papers','brief','briefs','policy','policies','analysis'],
 internship:['internship','internships','intern','interns','student','students','experience'],
 fellowship:['fellowship','fellowships','fellow','fellows'],
 volunteer:['volunteer','volunteering','volunteers','contribute'],
 opportunity:['opportunity','opportunities','apply','application','applications','eligible','eligibility','deadline','deadlines','open'],
 recording:['recording','recordings','video','videos','youtube','transcript','transcripts','timestamp','timestamps','webinar','webinars','podcast'],
};
const tags = [ ['research','trade','enterprise'],['research','enterprise','diplomacy'],['trade','jobs'],['enterprise','learning'],['learning'],['diplomacy'],['internship','opportunity'],['fellowship','opportunity'],['research','opportunity'],['volunteer','opportunity'],['enterprise','opportunity'] ];
export const catalogue = [...innerPageDirectory,...resources.map((r,i)=>({...r,id:`fa-${i+1}`,topics:tags[i],status:'unverified'})),...activities.map(s=>({id:`update-${s.id}`,title:s.title,type:'Update',description:s.summary,url:storyUrl(s.id),topics:s.topics,status:'published',date:s.date}))];
export const categories = ['All','Research','Programme','Opportunity','Update','About','People'];
export const suggestions = ['Find research on trade and jobs','Learning opportunities for entrepreneurs','Explore internships and fellowships','Find meeting recordings'];
const words = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w=>w&&!stop.has(w));
export function discover(query,category='All') {
 const tokens=words(query);const themes=Object.entries(topics).filter(([,synonyms])=>tokens.some(t=>synonyms.includes(t))).map(([theme])=>theme);
 const recording=themes.includes('recording');
 const matches = recording ? [] : catalogue.filter(r=>category==='All'||r.type===category).map(r=>{
  const title=words(r.title), body=words(r.description);
  let score=tokens.reduce((n,w)=>n+(title.includes(w)?(topics.opportunity.includes(w)?1:5):body.includes(w)?0.5:0),0);
  score+=themes.reduce((n,t)=>n+(r.topics.includes(t)?(t==='opportunity'?0.5:4):0),0);
  return {...r,score};
 }).filter(r=>!tokens.length||r.score>0).sort((a,b)=>b.score-a.score||((['Programme','Opportunity'].includes(b.type)?2:b.url.startsWith('/?story=')?1:0)-(['Programme','Opportunity'].includes(a.type)?2:a.url.startsWith('/?story=')?1:0)));
 let message=recording?'Recording search will be available once videos and transcripts have been added. No recordings are indexed yet.':matches.length?'These pages are the closest matches in our current directory.':'I couldn’t find a matching page in the current directory. Try a different topic or contact the team.';
 const notice='Programme pages contain the latest details. Application availability, deadlines and eligibility have not been verified in this directory.';
 return {results:matches,message,notice:matches.some(r=>r.type==='Opportunity')?notice:null,canAnswer:tokens.length>0&&matches.length>0&&!recording};
}
