import data from '../../data/cms/engage.json' with { type: 'json' };
export const engageServices = data.engageServices;
export const engageTopics = data.engageTopics;
export const contactDepartments = data.contactDepartments;
export const archivedVacancies = data.archivedVacancies;
export function getEngageService(id){return engageServices.find(item=>item.id===id)}
export function draftErrors(values){const errors={};if(!values.name?.trim())errors.name='Enter your name.';if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email?.trim()??''))errors.email='Enter a valid email address.';if(!values.message?.trim())errors.message='Add a short message.';return errors}
export function createEnquiryDraft(topicId,values={}){
 const topic=engageTopics.find(item=>item.id===topicId)??engageTopics[0];
 const oneLine=value=>String(value??'').trim().replace(/[\r\n]+/g,' ');
 const body=`Name: ${oneLine(values.name)}\nEmail: ${oneLine(values.email)}\nOrganisation: ${oneLine(values.organisation)}\n\n${String(values.message??'').trim()}`;
 return {subject:topic.subject,body,href:`mailto:info@foreignafrica.org?subject=${encodeURIComponent(topic.subject)}&body=${encodeURIComponent(body)}`};
}
