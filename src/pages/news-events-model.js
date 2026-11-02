import {newsItems} from './news-content.js';
export const newsCategories=['All news',...new Set(newsItems.map(item=>item.category))];
const normalise=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function filterNews({query='',category='All news',items=newsItems}={}){
 const words=normalise(query).trim().split(/\s+/).filter(Boolean);
 return items.filter(item=>(category==='All news'||item.category===category)&&words.every(word=>normalise(`${item.title} ${item.summary} ${item.location}`).includes(word))).sort((a,b)=>b.publishedOn.localeCompare(a.publishedOn));
}
export const displayDate=date=>{
 if(!date)return 'Date TBA';
 const iso=String(date).slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))return String(date);
 return new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(`${iso}T12:00:00Z`));
};
export function eventState(item,now=new Date()){
 if(item.cancelled)return 'cancelled';
 const date=item.date||item.eventDate||(item.startsAt?String(item.startsAt).slice(0,10):null);
 const startAt=item.startAt||item.startsAt;
 const endAt=item.endAt||item.endsAt;
 if(!date&&!startAt)return 'unannounced';
 if(endAt&&Date.parse(endAt)<=now.getTime())return 'past';
 if(!endAt&&date&&date<now.toISOString().slice(0,10))return 'past';
 if(startAt&&Date.parse(startAt)<=now.getTime())return 'ongoing';
 return 'upcoming';
}
export function listEvents(items,view='upcoming',now=new Date()){
 return items.filter(item=>view==='all'||eventState(item,now)===view||(view==='upcoming'&&eventState(item,now)==='ongoing')).sort((a,b)=>{
  const da=a.date||a.eventDate||(a.startsAt?String(a.startsAt).slice(0,10):'');
  const db=b.date||b.eventDate||(b.startsAt?String(b.startsAt).slice(0,10):'');
  return view==='past'?db.localeCompare(da):(da||'9999').localeCompare(db||'9999');
 });
}
