import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {commentaries} from '../src/pages/commentaries-content.js';
import {newsItems} from '../src/pages/news-content.js';
import {events} from '../src/pages/events-content.js';
import {teamMembers,additionalTeamMembers} from '../src/pages/team-content.js';
import {engageServices,engageTopics,contactDepartments,archivedVacancies} from '../src/pages/engage-content.js';

const dir='data/cms';
if(existsSync(`${dir}/commentaries.json`)&&!process.argv.includes('--force')){
 console.log('CMS content already seeded.');
 process.exit(0);
}
mkdirSync(dir,{recursive:true});
const write=(name,data)=>writeFileSync(`${dir}/${name}.json`,JSON.stringify(data,null,2)+'\n');
write('commentaries',commentaries);
write('news',newsItems);
write('events',events);
write('people',{teamMembers,additionalTeamMembers});
write('engage',{engageServices,engageTopics,contactDepartments,archivedVacancies});
const field=(id,label,type,required,options)=>({id,label,type,required,...(options?{options}:{})});
write('forms',[
 {id:'fellowship_application',purpose:'fellowship_application',title:'Fellowship application',status:'draft',success:'Your application has been received. This is not a selection decision.',fields:[field('name','Your name','text',true),field('email','Email address','email',true),field('background','Background','textarea',true),field('interests','Research interests','textarea',true),field('statement','Statement','textarea',true)]},
 {id:'internship_application',purpose:'internship_application',title:'Internship application',status:'draft',success:'Your interest has been received. This is not an offer.',fields:[field('name','Your name','text',true),field('email','Email address','email',true),field('background','Background','textarea',true),field('interest','Why this programme','textarea',true)]},
 {id:'paper_submission',purpose:'paper_submission',title:'Paper submission',status:'draft',success:'Your paper has been received. This is not an acceptance.',fields:[field('name','Corresponding author','text',true),field('email','Email address','email',true),field('title','Paper title','text',true),field('abstract','Abstract','textarea',true)]},
 {id:'volunteer_interest',purpose:'volunteer_interest',title:'Volunteer interest',status:'draft',success:'Your interest has been received.',fields:[field('name','Your name','text',true),field('email','Email address','email',true),field('skills','Skills','textarea',true),field('availability','Availability','text',false)]},
 {id:'event_registration',purpose:'event_registration',title:'Event registration',status:'draft',success:'Your registration has been received. This does not reserve a seat.',fields:[field('name','Your name','text',true),field('email','Email address','email',true),field('organisation','Organisation','text',false)]},
 {id:'partnership_enquiry',purpose:'partnership_enquiry',title:'Partnership enquiry',status:'draft',success:'Your enquiry has been received.',fields:[field('name','Your name','text',true),field('email','Email address','email',true),field('organisation','Organisation','text',true),field('message','Proposed collaboration','textarea',true)]},
 {id:'sponsorship_enquiry',purpose:'sponsorship_enquiry',title:'Sponsorship enquiry',status:'draft',success:'Your enquiry has been received. This is not a payment.',fields:[field('name','Your name','text',true),field('email','Email address','email',true),field('organisation','Organisation','text',true),field('message','Proposed support','textarea',true)]},
 {id:'speaker_request',purpose:'speaker_request',title:'Speaker request',status:'draft',success:'Your request has been received. This does not confirm a speaker.',fields:[field('name','Your name','text',true),field('email','Email address','email',true),field('organisation','Host organisation','text',true),field('message','Event, topic and proposed dates','textarea',true)]},
 {id:'general_enquiry',purpose:'general_enquiry',title:'General enquiry',status:'draft',success:'Your enquiry has been received.',fields:[field('name','Your name','text',true),field('email','Email address','email',true),field('organisation','Organisation','text',false),field('message','Your message','textarea',true)]},
 {id:'job_application',purpose:'job_application',title:'Job application',status:'draft',success:'Your application has been received.',fields:[field('name','Your name','text',true),field('email','Email address','email',true),field('message','Why you are applying','textarea',true)]},
]);
console.log('Seeded data/cms.');
