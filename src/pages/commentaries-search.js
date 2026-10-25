import {commentaries} from './commentaries-content.js';

export const commentaryTopics=['All topics','Diplomacy','Governance & society','Trade & jobs','Energy','Sport & diplomacy'];
export const commentaryYears=[...new Set(commentaries.map(item=>item.date.slice(0,4)))].sort().reverse();
const normalise=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

export function findCommentaries({query='',topic='All topics',year='All years',sort='newest',items=commentaries}={}){
  const words=normalise(query).split(/\s+/).filter(Boolean);
  return items.filter(item=>
    (topic==='All topics'||item.topic===topic)&&
    (year==='All years'||item.date.startsWith(year))&&
    words.every(word=>normalise([item.title,item.summary,item.topic,...item.tags,...item.authors].join(' ')).includes(word))
  ).sort((a,b)=>sort==='oldest'?a.date.localeCompare(b.date):b.date.localeCompare(a.date));
}

export const commentaryDate=date=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`));
