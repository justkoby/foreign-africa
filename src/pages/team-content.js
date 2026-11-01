// Biographies are supplied text. The CMS edits data/cms/people.json.
import data from '../../data/cms/people.json' with { type: 'json' };
export const teamMembers = data.teamMembers.filter(member => member.status !== 'draft');
export const additionalTeamMembers = data.additionalTeamMembers;
export const getMember = id => teamMembers.find(member => member.id === id);
