// Developer-controlled allowlists for what editors may select. Editors cannot add to these from the CMS.
import {storyVideo} from '../src/hero-content.js';
import {partners} from '../src/partners.js';
import {activities} from '../src/activities.js';

// Self-hosted video upload is not available yet (see the roadmap). Until then, hero video is chosen from this list.
export const approvedVideos = [
  {id: 'our-story-film', label: 'Our story film', src: storyVideo, poster: '/images/hero/story-poster.jpg'},
];
export const knownPartners = partners.map(partner => ({id: partner.id, name: partner.name}));
export const knownStories = activities.map(story => ({id: story.id, title: story.title}));
