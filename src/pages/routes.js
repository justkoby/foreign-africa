import {commentaries} from './commentaries-content.js';
import {engageServices} from './engage-content.js';
import {events} from './events-content.js';
import {opportunityPathways,internshipProgramme} from './opportunities-content.js';
export const personUrl=id=>`/people/${encodeURIComponent(id)}/`;
export const teamGroups=[
 {id:'council',path:'/advisory-council/',label:'Advisory Council',description:'Experience and perspective supporting Foreign Africa’s institutional development and long-term direction.'},
 {id:'executive',path:'/executive-leadership/',label:'Executive Leadership',description:'The people connecting strategy, programmes, research and public engagement.'},
 {id:'secretariat',path:'/secretariat/',label:'Secretariat',description:'Programme delivery, partnerships, coordination and research supporting our day-to-day work.'},
 {id:'associates',path:'/junior-associates/',label:'Junior Associates',description:'Meet the cohort featured in our Remote Internship Programme.'},
];
export function resolvePage(pathname){
 const path='/'+pathname.split('/').filter(Boolean).join('/')+'/';
 if(['/about-us/','/who-we-are/','/our-mission-vision/'].includes(path))return {type:'about'};
 if(['/blog/','/commentaries/','/category/blog/'].includes(path))return {type:'commentaries'};
 const article=commentaries.find(item=>path===`/${item.slug}/`||path===`/blog/${item.slug}/`);if(article)return {type:'commentary',id:article.id,slug:article.slug};
 if(path==='/remote-internship-programme-rip/')return {type:'opportunity',id:internshipProgramme.id};
 if(path==='/engage/')return {type:'engage'};
 if(path==='/contact/')return {type:'contact'};
 if(path==='/careers/')return {type:'careers'};
 const service=engageServices.find(item=>item.path===path);if(service)return {type:'engage-service',id:service.id};
 if(['/news/','/news-events/'].includes(path))return {type:'news'};
 const newsArticle=path.match(/^\/news\/([a-z0-9-]+)\/$/);if(newsArticle)return {type:'news-article',slug:newsArticle[1]};
 const blogArticle=path.match(/^\/blog\/([a-z0-9-]+)\/$/);if(blogArticle)return {type:'commentary',slug:blogArticle[1]};
 if(path==='/events/')return {type:'events'};
 const event=events.find(item=>path===`/events/${item.id}/`);if(event)return {type:'event',id:event.id};
 if(path==='/opportunities/')return {type:'opportunities'};
 const pathway=opportunityPathways.find(item=>item.path===path||(item.id==='enterprise-week'&&path==='/foreign-africa-enterprise-week-few/'));
 if(pathway)return {type:'opportunity',id:pathway.id};
 if(path==='/partners/')return {type:'partners'};
 if(path==='/policy-briefs/')return {type:'policy'};
 if(path==='/our-people/')return {type:'team',group:'council'};
 const group=teamGroups.find(g=>g.path===path);if(group)return {type:'team',group:group.id};
 const profile=path.match(/^\/people\/([a-z0-9-]+)\/$/);if(profile)return {type:'profile',id:profile[1]};
 const published=path.match(/^\/([a-z0-9-]+)\/$/);if(published)return {type:'commentary',slug:published[1]};
 return null;
}
