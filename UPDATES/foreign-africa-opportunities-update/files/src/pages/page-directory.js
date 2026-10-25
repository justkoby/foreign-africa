import {commentaries} from './commentaries-content.js';
import {policyBriefs} from './policy-content.js';
import {teamMembers} from './team-content.js';
import {teamGroups,personUrl} from './routes.js';
export const innerPageDirectory=[
 {id:'opportunities-hub',title:'Explore opportunities',type:'Opportunity',description:'An overview of fellowships, calls for papers, volunteering and Enterprise Week. Current calls, roles and event edition details are not listed here.',url:'/opportunities/',topics:['opportunity'],status:'unverified'},
 ...commentaries.map(item=>({id:`commentary-${item.id}`,title:item.title,type:'Research',description:item.summary,url:item.sourceUrl,topics:['research',...(['Diplomacy','Sport & diplomacy'].includes(item.topic)?['diplomacy']:item.topic==='Trade & jobs'?['trade','jobs']:item.topic==='Energy'?['trade']:['leadership'])],status:'published',date:item.date})),
 {id:'partners',title:'Our partners',type:'About',description:'Meet the organisations connected with Foreign Africa, including ACCORD and All-Africa Students Union.',url:'/partners/',topics:['diplomacy','enterprise'],status:'published'},
 ...policyBriefs.map(b=>({id:`brief-${b.issue}`,title:b.title,type:'Research',description:b.summary,url:b.url,topics:b.issue==='002'?['research','jobs']:['research','diplomacy'],status:'published'})),
 {id:'about-foreign-africa',title:'Who we are — Foreign Africa',type:'About',description:'Foreign Africa’s purpose, mission, vision, values and approach connecting policy, enterprise and diplomacy.',url:'/who-we-are/',topics:['research','enterprise','diplomacy'],status:'published'},
 ...teamGroups.map(g=>({id:`people-${g.id}`,title:g.label,type:'People',description:g.description,url:g.path,topics:g.id==='associates'?['internship','learning']:['leadership'],status:'published'})),
 ...teamMembers.map(m=>({id:`person-${m.id}`,title:m.name,type:'People',description:`${m.role}. ${m.intro}`,url:personUrl(m.id),topics:['leadership'],status:'published'})),
];
