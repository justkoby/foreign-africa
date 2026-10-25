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
 if(path==='/partners/')return {type:'partners'};
 if(path==='/policy-briefs/')return {type:'policy'};
 if(path==='/our-people/')return {type:'team',group:'council'};
 const group=teamGroups.find(g=>g.path===path);if(group)return {type:'team',group:group.id};
 const profile=path.match(/^\/people\/([a-z0-9-]+)\/$/);if(profile)return {type:'profile',id:profile[1]};
 return null;
}
