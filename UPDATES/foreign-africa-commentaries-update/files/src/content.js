const origin = 'https://foreignafrica.org';
export const page = (slug) => `${origin}/${slug}/`;
export const resources = [
 {title:'Policy briefs',type:'Research',description:'Evidence and analysis on the policies shaping Africa’s economic future.',url:'/policy-briefs/'},
 {title:'Commentaries',type:'Research',description:'Perspectives on enterprise, diplomacy and economic transformation.',url:'/blog/'},
 {title:'Africa Trade & Job Tracker',type:'Programme',description:'Explore the connection between trade and employment.',url:page('africa-trade-job-tracker-atjt')},
 {title:'Enterprise Development Workshop Series',type:'Programme',description:'Learning opportunities for entrepreneurs and growing businesses.',url:page('enterprise-development-workshop-series-edws')},
 {title:'Skillshare@ForeignAfrica',type:'Programme',description:'Explore skills and learning opportunities.',url:page('skillshareforeignafrica')},
 {title:'Municipal Diplomacy Programme',type:'Programme',description:'Discover our work in municipal diplomacy.',url:page('municipal-diplomacy-programme-mdp')},
 {title:'Remote Internship Programme',type:'Opportunity',description:'Find programme information and participation details.',url:page('remote-internship-programme-rip')},
 {title:'Fellowships',type:'Opportunity',description:'Explore fellowship information and available calls.',url:page('fellowships')},
 {title:'Calls for papers',type:'Opportunity',description:'Find research calls and submission details.',url:page('calls-for-papers')},
 {title:'Volunteer opportunities',type:'Opportunity',description:'Discover ways to contribute to Foreign Africa’s work.',url:page('volunteer-opportunities')},
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
