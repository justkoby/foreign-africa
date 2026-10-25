import {teamMembers} from './team-content.js';
import {teamGroups,personUrl} from './routes.js';
export const innerPageDirectory=[
 {id:'about-foreign-africa',title:'Who we are — Foreign Africa',type:'About',description:'Foreign Africa’s purpose, mission, vision, values and approach connecting policy, enterprise and diplomacy.',url:'/who-we-are/',topics:['research','enterprise','diplomacy'],status:'published'},
 ...teamGroups.map(g=>({id:`people-${g.id}`,title:g.label,type:'People',description:g.description,url:g.path,topics:g.id==='associates'?['internship','learning']:['leadership'],status:'published'})),
 ...teamMembers.map(m=>({id:`person-${m.id}`,title:m.name,type:'People',description:`${m.role}. ${m.intro}`,url:personUrl(m.id),topics:['leadership'],status:'published'})),
];
