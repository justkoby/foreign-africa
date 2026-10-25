const origin = 'https://foreignafrica.org';
const localEngageSlugs=new Set(['remote-internship-programme-rip','engage','partner-with-us','sponsor-a-programme','book-a-speaker','careers','contact']);
export const page = (slug) => localEngageSlugs.has(slug)?`/${slug}/`:`${origin}/${slug}/`;
export const resources = [
 {title:'Policy briefs',type:'Research',description:'Evidence and analysis on the policies shaping Africa’s economic future.',url:'/policy-briefs/'},
 {title:'Commentaries',type:'Research',description:'Perspectives on enterprise, diplomacy and economic transformation.',url:'/blog/'},
 {title:'Africa Trade & Job Tracker',type:'Programme',description:'Explore the connection between trade and employment.',url:page('africa-trade-job-tracker-atjt')},
 {title:'Enterprise Development Workshop Series',type:'Programme',description:'Learning opportunities for entrepreneurs and growing businesses.',url:page('enterprise-development-workshop-series-edws')},
 {title:'Skillshare@ForeignAfrica',type:'Programme',description:'Explore skills and learning opportunities.',url:page('skillshareforeignafrica')},
 {title:'Municipal Diplomacy Programme',type:'Programme',description:'Discover our work in municipal diplomacy.',url:page('municipal-diplomacy-programme-mdp')},
 {title:'Remote Internship Programme',type:'Opportunity',description:'Find programme information and participation details.',url:page('remote-internship-programme-rip')},
 {title:'Fellowships',type:'Opportunity',description:'Explore the fellowship pathway. No current fellowship call is listed here.',url:'/fellowships/'},
 {title:'Calls for papers',type:'Opportunity',description:'Explore research themes and submission pathways. No current submission call is listed here.',url:'/calls-for-papers/'},
 {title:'Volunteer opportunities',type:'Opportunity',description:'Explore the volunteer network. No specific volunteer roles are listed here.',url:'/volunteer-opportunities/'},
 {title:'Foreign Africa Enterprise Week',type:'Opportunity',description:'Explore the enterprise convening. Dates and registration for a specific edition are not announced here.',url:'/foreign-africa-enterprise-week-few-2/'},
];
export const navigation = [
 {label:'Who we are',href:'#about'}, {label:'Our focus',href:'#focus'},
 {label:'Research & insights',href:'#research'}, {label:'Programmes',href:'#programmes'},
 {label:'Opportunities',href:'#opportunities'},
];
export function searchResources(query,category='All') {
 const words=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
 return resources.filter(r=>(category==='All'||r.type===category)&&words.every(w=>`${r.title} ${r.type} ${r.description}`.toLocaleLowerCase().includes(w)));
}
