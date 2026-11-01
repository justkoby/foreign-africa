// Pure field definitions for the homepage editing contract. No Node imports, so the browser editor can use them too.
export const text = (label, max, extra = {}) => ({type: 'text', label, max, ...extra});
const longtext = (label, max, extra = {}) => ({type: 'longtext', label, max, ...extra});
const lines = (label, count, max, extra = {}) => ({type: 'lines', label, count, max, ...extra});
const cta = (label = 'Button', extra = {}) => ({type: 'cta', label, ...extra});
const link = (label, extra = {}) => ({type: 'link', label, ...extra});
const image = (label, extra = {}) => ({type: 'image', label, ...extra});
const list = (label, min, max, item, extra = {}) => ({type: 'list', label, min, max, item, ...extra});

export const homepageSections = [
  {key: 'discovery', label: 'Search prompt', fields: {eyebrow: text('Small label', 40), text: text('Prompt', 90), button: text('Button text', 60)}},
  {key: 'about', label: 'About Foreign Africa', fields: {eyebrow: text('Small label', 40), heading: lines('Heading', 2, 60), lead: longtext('Lead sentence', 200), paragraphs: {type: 'texts', label: 'Paragraphs', count: 2, max: 400}, cta: cta('Link')}},
  {key: 'convening', label: 'Highlight photo and story', fields: {image: image('Photo'), alt: text('Photo description (for screen readers)', 200), caption: text('Caption', 120), eyebrow: text('Small label', 60), heading: lines('Heading', 2, 50), text: longtext('Text', 240), cta: cta('Link')}},
  {key: 'activity', label: 'Featured stories', fields: {eyebrow: text('Small label', 40), heading: lines('Heading', 2, 50), intro: lines('Introduction', 2, 70), lead: {type: 'story', label: 'Lead story'}, cards: {type: 'stories', label: 'Three more stories', count: 3}}},
  {key: 'people', label: 'People', fields: {eyebrow: text('Small label', 60), heading: lines('Heading', 2, 40), emphasis: text('Emphasised last line', 30), text: longtext('Text', 260), cta: cta('Button'), scrollHint: text('Scroll hint', 50)}},
  {key: 'focus', label: 'Our focus', fields: {eyebrow: text('Small label', 40), heading: lines('Heading', 2, 50), intro: lines('Introduction', 2, 50), cards: list('Focus cards', 3, 3, {title: text('Title', 30), line: text('Tagline', 40), text: longtext('Text', 200), href: link('Link')}, {fixed: true})}},
  {key: 'engagement', label: 'Engagement', fields: {image: image('Photo'), alt: text('Photo description (for screen readers)', 200), eyebrow: text('Small label', 60), heading: lines('Heading', 2, 40), text: longtext('Text', 240), cta: cta('Link')}},
  {key: 'research', label: 'Research and insights', fields: {eyebrow: text('Small label', 40), heading: lines('Heading', 2, 40), cta: cta('Header link'), items: list('Link cards', 2, 2, {eyebrow: text('Small label', 40), heading: lines('Heading', 2, 40), text: longtext('Text', 160), cta: text('Link text', 40), href: link('Link')}, {fixed: true})}},
  {key: 'programmes', label: 'Programmes', fields: {eyebrow: text('Small label', 40), heading: lines('Heading', 2, 40), emphasis: text('Emphasised last line', 30), text: longtext('Text', 200), cta: cta('Link'), items: list('Programmes', 1, 8, {title: text('Title', 60), description: longtext('Description', 300), url: link('Link')})}},
  {key: 'opportunities', label: 'Opportunities', fields: {eyebrow: text('Small label', 40), heading: lines('Heading', 2, 40), cta: cta('Header link'), intro: longtext('Introduction', 200), note: text('Note', 160), noteLink: cta('Note link')}},
  {key: 'partners', label: 'Partners', fields: {eyebrow: text('Small label', 50), heading: text('Heading', 40), cta: cta('Link'), items: {type: 'partners', label: 'Partner logos'}}},
  {key: 'connect', label: 'Call to action', fields: {eyebrow: text('Small label', 40), heading: lines('Heading', 1, 40), emphasis: text('Emphasised line', 40), arrowHref: link('Arrow button link'), arrowLabel: text('Arrow button description (for screen readers)', 80), text: lines('Text', 2, 60), cta: cta('Button')}},
];

export const heroLimits = {slides: 8, durationMin: 8000, durationMax: 20000};

