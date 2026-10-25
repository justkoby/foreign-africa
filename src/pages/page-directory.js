import {engageServices} from './engage-content.js';
import {newsItems} from './news-content.js';
import {events,eventUrl} from './events-content.js';
import {commentaries,commentaryUrl} from './commentaries-content.js';
import {policyBriefs} from './policy-content.js';
import {teamMembers} from './team-content.js';
import {teamGroups,personUrl} from './routes.js';
export const innerPageDirectory=[
 {id:'engage-hub',title:'Engage with Foreign Africa',type:'About',description:'Partnerships, programme sponsorship, speaker requests, careers and contact routes.',url:'/engage/',topics:['diplomacy','enterprise'],status:'published'},
 ...engageServices.map(item=>({id:`engage-${item.id}`,title:item.title,type:'About',description:item.summary,url:item.path,topics:item.id==='speaker'?['research','leadership']:['enterprise','diplomacy'],status:'published'})),
 {id:'contact-team',title:'Contact Foreign Africa',type:'About',description:'Published departmental email addresses and an email-draft enquiry composer. No message is sent automatically.',url:'/contact/',topics:[],status:'published'},
 {id:'careers-directory',title:'Careers at Foreign Africa',type:'Opportunity',description:'Career information. The Institutional Partnerships Officer source listing is expired; no active vacancy is listed here.',url:'/careers/',topics:['opportunity'],status:'unverified'},
 {id:'news-directory',title:'News & updates',type:'Update',description:'Published mission reports, institutional engagements and community news from Foreign Africa.',url:'/news/',topics:['diplomacy','research'],status:'published'},
 {id:'events-directory',title:'Events and past announcements',type:'Update',description:'Browse the event calendar and past workshop and community announcements. Registration availability is not verified.',url:'/events/',topics:['learning'],status:'published'},
 ...newsItems.filter(item=>!item.url.startsWith('/?')).map(item=>({id:`news-${item.id}`,title:item.title,type:'Update',description:item.summary,url:item.url,topics:item.category==='Community'?['learning','internship']:['diplomacy','research'],status:'published',date:item.publishedOn})),
 ...events.map(item=>({id:`event-${item.id}`,title:item.title,type:'Update',description:`${item.summary} Announced date: ${item.date}. Registration is unavailable on this page; no recording is verified.`,url:eventUrl(item),topics:['learning'],status:'published',date:item.date})),
 {id:'opportunities-hub',title:'Explore opportunities',type:'Opportunity',description:'An overview of fellowships, calls for papers, volunteering and Enterprise Week. Current calls, roles and event edition details are not listed here.',url:'/opportunities/',topics:['opportunity'],status:'unverified'},
 ...commentaries.map(item=>({id:`commentary-${item.id}`,title:item.title,type:'Research',description:item.summary,url:commentaryUrl(item),topics:['research',...(['Diplomacy','Sport & diplomacy'].includes(item.topic)?['diplomacy']:item.topic==='Trade & jobs'?['trade','jobs']:item.topic==='Energy'?['trade']:['leadership'])],status:'published',date:item.date})),
 {id:'partners',title:'Our partners',type:'About',description:'Meet the organisations connected with Foreign Africa, including ACCORD and All-Africa Students Union.',url:'/partners/',topics:['diplomacy','enterprise'],status:'published'},
 ...policyBriefs.map(b=>({id:`brief-${b.issue}`,title:b.title,type:'Research',description:b.summary,url:b.url,topics:b.issue==='002'?['research','jobs']:['research','diplomacy'],status:'published'})),
 {id:'about-foreign-africa',title:'Who we are — Foreign Africa',type:'About',description:'Foreign Africa’s purpose, mission, vision, values and approach connecting policy, enterprise and diplomacy.',url:'/who-we-are/',topics:['research','enterprise','diplomacy'],status:'published'},
 ...teamGroups.map(g=>({id:`people-${g.id}`,title:g.label,type:'People',description:g.description,url:g.path,topics:g.id==='associates'?['internship','learning']:['leadership'],status:'published'})),
 ...teamMembers.map(m=>({id:`person-${m.id}`,title:m.name,type:'People',description:`${m.role}. ${m.intro}`,url:personUrl(m.id),topics:['leadership'],status:'published'})),
];
