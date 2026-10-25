import {newsItems} from './news-content.js';
export const newsCategories=['All news',...new Set(newsItems.map(item=>item.category))];
const normalise=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function filterNews({query='',category='All news',items=newsItems}={}){
 const words=normalise(query).trim().split(/\s+/).filter(Boolean);
 return items.filter(item=>(category==='All news'||item.category===category)&&words.every(word=>normalise(`${item.title} ${item.summary} ${item.location}`).includes(word))).sort((a,b)=>b.publishedOn.localeCompare(a.publishedOn));
}
export const displayDate=date=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`));
export function eventState(item,now=new Date()){
 if(item.cancelled)return 'cancelled';
 if(!item.date)return 'unannounced';
 if(item.endAt&&Date.parse(item.endAt)<=now.getTime())return 'past';
 if(!item.endAt&&item.date<now.toISOString().slice(0,10))return 'past';
 if(item.startAt&&Date.parse(item.startAt)<=now.getTime())return 'ongoing';
 return 'upcoming';
}
export function listEvents(items,view='upcoming',now=new Date()){
 return items.filter(item=>view==='all'||eventState(item,now)===view||(view==='upcoming'&&eventState(item,now)==='ongoing')).sort((a,b)=>view==='past'?(b.date??'').localeCompare(a.date??''):(a.date??'9999').localeCompare(b.date??'9999'));
}
