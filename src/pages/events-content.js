// Announced schedules are not evidence of attendance, completion or a recording.
import items from '../../data/cms/events.json' with { type: 'json' };
export const events = items.filter(item => item.status !== 'draft');
export const eventUrl = item => `/events/${item.id}/`;
