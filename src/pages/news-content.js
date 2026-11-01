// publishedOn is the article publication date, not the event date.
import items from '../../data/cms/news.json' with { type: 'json' };
export const newsItems = items.filter(item => item.status !== 'draft');
