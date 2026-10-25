// Catalogue edited in the CMS. Full article bodies stay in public/content/commentaries.
import items from '../../data/cms/commentaries.json' with { type: 'json' };
export const commentaries = items.filter(item => item.status !== 'draft');
export const commentaryUrl = item => `/${item.slug}/`;
