// The editing contract for homepage and hero content. Editors can change VALUES of the fields declared here and
// nothing else: layout, markup, class names, CSS, scripts, animation and breakpoints are not fields, so any attempt to
// send them is rejected. The same descriptors drive the editor forms, so what is validated is what is shown.
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homepageDefaults} from '../src/homepage-defaults.js';
import {heroSlides} from '../src/hero-content.js';
import {youtubeId} from './embeds.js';
import {approvedVideos, knownPartners, knownStories} from './site-approved.js';
import {mediaUrl} from './media.js';

import {heroLimits, homepageSections} from './site-fields.js';
export {heroLimits, homepageSections};

// ---------------------------------------------------------------- validation helpers
const markup = /<\/?[a-z!][^>]*>/i;
// Control characters and the Unicode line/paragraph separators, built from code points.
const controlCharacters = new RegExp(`[\\x00-\\x1f\\x7f${String.fromCharCode(0x2028)}${String.fromCharCode(0x2029)}]`, 'g');

export class Problems {
  constructor() { this.list = []; }
  add(path, message) { this.list.push({path, message}); }
  get any() { return this.list.length > 0; }
}

function plain(value, path, max, problems, {required = true} = {}) {
  if (value === undefined || value === null || value === '') { if (required) problems.add(path, 'This field is required.'); return ''; }
  if (typeof value !== 'string') { problems.add(path, 'Enter text.'); return ''; }
  const clean = value.replace(controlCharacters, ' ').replace(/\s+/g, ' ').trim();
  if (!clean && required) { problems.add(path, 'This field is required.'); return ''; }
  if (clean.length > max) problems.add(path, `Use ${max} characters or fewer (currently ${clean.length}).`);
  if (markup.test(clean)) problems.add(path, 'HTML and markup are not allowed here.');
  return clean;
}

export function ctaHosts(config) {
  const hosts = new Set(['foreignafrica.org']);
  try { hosts.add(new URL(config.publicSiteUrl).hostname.toLowerCase()); } catch { /* configured elsewhere */ }
  for (const extra of String(config.ctaExtraHosts || '').split(',')) if (extra.trim()) hosts.add(extra.trim().toLowerCase());
  return [...hosts];
}

// A link may point inside the site, to an anchor, to an e-mail address, or to an approved host. Nothing else.
export function checkHref(raw, config) {
  const href = String(raw ?? '').trim();
  if (!href) return {error: 'Enter a link.'};
  if (href.length > 300) return {error: 'That link is too long.'};
  if (/[\s\\\u0000-\u001f]/.test(href)) return {error: 'That link contains characters that are not allowed.'};
  if (href.startsWith('#')) return /^#[A-Za-z0-9_-]+$/.test(href) ? {href} : {error: 'Use a simple #section link.'};
  if (href.startsWith('/')) {
    if (href.startsWith('//') || href.split(/[?#]/)[0].split('/').includes('..') || !/^\/[A-Za-z0-9/_\-.~%?=&#:+,@]*$/.test(href)) return {error: 'That page link is not valid.'};
    return {href};
  }
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(href)) return {href};
  let url;
  try { url = new URL(href); } catch { return {error: 'Start with /, #, mailto: or https://.'}; }
  if (url.protocol !== 'https:' || url.username || url.password) return {error: 'External links must use https:// and no login details.'};
  const host = url.hostname.toLowerCase();
  const allowed = ctaHosts(config);
  if (!allowed.some(item => host === item || host.endsWith(`.${item}`))) return {error: `Links to ${host} are not approved. Approved sites: ${allowed.join(', ')}.`};
  return {href};
}

const siteRoots = [join(fileURLToPath(new URL('..', import.meta.url)), 'dist'), join(fileURLToPath(new URL('..', import.meta.url)), 'public')];
export function siteImageExists(src) {
  return /^\/images\/[A-Za-z0-9._/-]+$/.test(src) && !src.includes('..') && siteRoots.some(root => existsSync(join(root, src)));
}

// Resolves an image choice to a real address. A library file is looked up (and must be an image); a built-in site
// image must exist. Anything else, including arbitrary URLs, is refused.
async function checkImage(value, path, ctx, problems, {required = true} = {}) {
  if (value === null || value === undefined) { if (required) problems.add(path, 'Choose an image.'); return null; }
  if (typeof value !== 'object' || Array.isArray(value)) { problems.add(path, 'Choose an image.'); return null; }
  for (const key of Object.keys(value)) if (!['src', 'mediaId'].includes(key)) problems.add(`${path}.${key}`, 'This field is not editable.');
  let id = Number.isInteger(value.mediaId) ? value.mediaId : null;
  const match = typeof value.src === 'string' ? value.src.match(/^\/media\/(\d+)$/) : null;
  if (!id && match) id = Number(match[1]);
  if (id) {
    const row = await ctx.mediaLookup(id);
    if (!row) { problems.add(path, 'That library file no longer exists.'); return null; }
    if (row.mime_type === 'application/pdf') { problems.add(path, 'Choose an image, not a document.'); return null; }
    return {src: mediaUrl(id, row.storage_path), mediaId: id};
  }
  if (typeof value.src === 'string' && siteImageExists(value.src)) return {src: value.src};
  problems.add(path, 'Choose an image from the media library.');
  return null;
}

async function validateField(descriptor, value, path, ctx, problems) {
  switch (descriptor.type) {
    case 'text': return plain(value, path, descriptor.max, problems);
    case 'longtext': return plain(value, path, descriptor.max, problems);
    case 'lines': {
      if (!Array.isArray(value) || value.length !== descriptor.count) { problems.add(path, `Enter ${descriptor.count} line${descriptor.count === 1 ? '' : 's'}.`); return []; }
      return value.map((line, index) => plain(line, `${path}[${index}]`, descriptor.max, problems));
    }
    case 'texts': {
      if (!Array.isArray(value) || value.length !== descriptor.count) { problems.add(path, `Enter ${descriptor.count} paragraphs.`); return []; }
      return value.map((item, index) => plain(item, `${path}[${index}]`, descriptor.max, problems));
    }
    case 'link': {
      const checked = checkHref(value, ctx.config);
      if (checked.error) problems.add(path, checked.error);
      return checked.href ?? '';
    }
    case 'cta': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) { problems.add(path, 'Enter a label and a link.'); return {label: '', href: ''}; }
      for (const key of Object.keys(value)) if (!['label', 'href'].includes(key)) problems.add(`${path}.${key}`, 'This field is not editable.');
      const checked = checkHref(value.href, ctx.config);
      if (checked.error) problems.add(`${path}.href`, checked.error);
      return {label: plain(value.label, `${path}.label`, 40, problems), href: checked.href ?? ''};
    }
    case 'image': return checkImage(value, path, ctx, problems);
    case 'story': {
      if (!ctx.storyIds.has(value)) problems.add(path, 'Choose one of the available stories.');
      return value;
    }
    case 'stories': {
      if (!Array.isArray(value) || value.length !== descriptor.count) { problems.add(path, `Choose ${descriptor.count} stories.`); return []; }
      value.forEach((id, index) => { if (!ctx.storyIds.has(id)) problems.add(`${path}[${index}]`, 'Choose one of the available stories.'); });
      if (new Set(value).size !== value.length) problems.add(path, 'Choose different stories.');
      return value;
    }
    case 'partners': {
      if (!Array.isArray(value) || !value.length) { problems.add(path, 'Keep at least one partner.'); return []; }
      const seen = new Set();
      const items = value.map((item, index) => {
        if (!item || typeof item !== 'object') { problems.add(`${path}[${index}]`, 'Not valid.'); return null; }
        for (const key of Object.keys(item)) if (!['id', 'visible'].includes(key)) problems.add(`${path}[${index}].${key}`, 'This field is not editable.');
        if (!ctx.partnerIds.has(item.id)) problems.add(`${path}[${index}]`, 'Unknown partner.');
        if (seen.has(item.id)) problems.add(`${path}[${index}]`, 'Each partner can appear once.');
        seen.add(item.id);
        return {id: item.id, visible: item.visible !== false};
      }).filter(Boolean);
      if (items.length && !items.some(item => item.visible)) problems.add(path, 'Show at least one partner.');
      return items;
    }
    case 'list': {
      if (!Array.isArray(value) || value.length < descriptor.min || value.length > descriptor.max) { problems.add(path, descriptor.min === descriptor.max ? `Provide exactly ${descriptor.min}.` : `Provide between ${descriptor.min} and ${descriptor.max}.`); return []; }
      const out = [];
      for (const [index, entry] of value.entries()) out.push(await validateObject(descriptor.item, entry, `${path}[${index}]`, ctx, problems));
      return out;
    }
    default: throw new Error(`Unknown field type ${descriptor.type}`);
  }
}

async function validateObject(fields, value, path, ctx, problems) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) { problems.add(path, 'Not valid.'); return {}; }
  for (const key of Object.keys(value)) if (!(key in fields)) problems.add(path ? `${path}.${key}` : key, 'This field is not editable here.');
  const out = {};
  for (const [key, descriptor] of Object.entries(fields)) {
    if (!(key in value)) { problems.add(path ? `${path}.${key}` : key, 'This field is required.'); continue; }
    out[key] = await validateField(descriptor, value[key], path ? `${path}.${key}` : key, ctx, problems);
  }
  return out;
}

export async function validateHomepage(input, ctx) {
  const problems = new Problems();
  if (!input || typeof input !== 'object' || Array.isArray(input)) { problems.add('', 'Send the homepage content.'); return {problems}; }
  const known = new Set(homepageSections.map(section => section.key));
  for (const key of Object.keys(input)) if (!known.has(key)) problems.add(key, 'This section is not editable.');
  const value = {};
  for (const section of homepageSections) {
    if (!(section.key in input)) continue;
    value[section.key] = await validateObject(section.fields, input[section.key], section.key, ctx, problems);
  }
  return {value, problems};
}

// ---------------------------------------------------------------- hero
const position = /^(?:(?:100|[1-9]?\d)%|left|right|center|top|bottom)(?: (?:(?:100|[1-9]?\d)%|left|right|center|top|bottom))?$/;

async function checkHeroMedia(value, path, slide, ctx, problems, {allowVideo, required}) {
  if (value === null || value === undefined) { if (required) problems.add(path, 'Choose an image.'); return null; }
  if (typeof value !== 'object' || Array.isArray(value)) { problems.add(path, 'Not valid.'); return null; }
  const allowed = ['type', 'src', 'mediaId', 'poster', 'position', 'alt', 'panel', 'videoId'];
  for (const key of Object.keys(value)) if (!allowed.includes(key)) problems.add(`${path}.${key}`, 'This field is not editable.');
  const out = {};
  if (value.type === 'video') {
    if (!allowVideo) { problems.add(`${path}.type`, 'This kind of slide takes an image.'); return null; }
    const video = approvedVideos.find(item => item.id === value.videoId) ?? approvedVideos.find(item => item.src === value.src);
    if (!video) { problems.add(path, 'Choose one of the approved videos.'); return null; }
    out.type = 'video'; out.src = video.src;
    const poster = await checkImage(value.poster ? {src: value.poster, ...(Number.isInteger(value.posterId) ? {mediaId: value.posterId} : {})} : {src: video.poster}, `${path}.poster`, ctx, problems);
    out.poster = poster?.src ?? video.poster;
    if (value.videoId) out.videoId = video.id;
  } else if (value.type === 'image') {
    const picked = await checkImage({src: value.src, mediaId: value.mediaId}, path, ctx, problems);
    if (!picked) return null;
    out.type = 'image'; out.src = picked.src;
    if (picked.mediaId) out.mediaId = picked.mediaId;
    out.alt = plain(value.alt, `${path}.alt`, 300, problems);
    // A crop treatment such as `panel` belongs to a specific developer-prepared source image; it is kept only when
    // that exact image is unchanged, and an editor can never add one.
    const previous = ctx.panels.get(`${slide.id}|${path.split('.').pop()}|${picked.src}`);
    if (previous !== undefined) out.panel = previous;
  } else { problems.add(`${path}.type`, 'Choose an image or an approved video.'); return null; }
  if (value.position !== undefined && value.position !== null && value.position !== '') {
    if (typeof value.position !== 'string' || !position.test(value.position)) problems.add(`${path}.position`, 'Use a position such as center, left, or 60% 40%.');
    else out.position = value.position;
  } else if (value.position === '' || value.position === undefined) {
    const kept = ctx.positions.get(`${slide.id}|${path.split('.').pop()}|${out.src}`);
    if (kept) out.position = kept;
  }
  if (value.type === 'video' && value.alt) out.alt = plain(value.alt, `${path}.alt`, 300, problems);
  return out;
}

async function checkFeatured(value, path, ctx, problems) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) { problems.add(path, 'Not valid.'); return null; }
  for (const key of Object.keys(value)) if (!['label', 'title', 'type', 'src', 'videoId', 'thumbnail', 'thumbnailId'].includes(key)) problems.add(`${path}.${key}`, 'This field is not editable.');
  const out = {label: plain(value.label, `${path}.label`, 40, problems), title: plain(value.title, `${path}.title`, 100, problems)};
  if (value.type === 'youtube') {
    const id = youtubeId(value.src);
    if (!id) problems.add(`${path}.src`, 'Use a youtube.com or youtu.be link.');
    out.type = 'youtube'; out.src = id ? `https://youtu.be/${id}` : '';
  } else if (value.type === 'video') {
    const video = approvedVideos.find(item => item.id === value.videoId) ?? approvedVideos.find(item => item.src === value.src);
    if (!video) problems.add(`${path}.src`, 'Choose one of the approved videos.');
    out.type = 'video'; out.src = video?.src ?? '';
    if (value.videoId) out.videoId = video?.id;
  } else problems.add(`${path}.type`, 'Choose an approved video or a YouTube link.');
  const thumb = await checkImage({src: value.thumbnail, ...(Number.isInteger(value.thumbnailId) ? {mediaId: value.thumbnailId} : {})}, `${path}.thumbnail`, ctx, problems);
  out.thumbnail = thumb?.src ?? '';
  return out;
}

const storyKeys = ['id', 'enabled', 'kind', 'label', 'title', 'lines', 'emphasis', 'description', 'cta', 'duration', 'desktopMedia', 'mobileMedia', 'featuredMedia'];
const artworkKeys = ['id', 'enabled', 'kind', 'label', 'title', 'cta', 'duration', 'desktopMedia', 'mobileMedia'];

export async function validateHero(input, ctx, {forPublish = false} = {}) {
  const problems = new Problems();
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Array.isArray(input.slides)) { problems.add('', 'Send the hero slides.'); return {problems}; }
  for (const key of Object.keys(input)) if (key !== 'slides') problems.add(key, 'This field is not editable.');
  if (input.slides.length < 1 || input.slides.length > heroLimits.slides) problems.add('slides', `Keep between 1 and ${heroLimits.slides} slides.`);
  const ids = new Set();
  const slides = [];
  for (const [index, raw] of input.slides.slice(0, heroLimits.slides).entries()) {
    const path = `slides[${index}]`;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { problems.add(path, 'Not valid.'); continue; }
    const story = raw.kind === 'story';
    if (!story && raw.kind !== 'artwork') problems.add(`${path}.kind`, 'Choose a slide type.');
    for (const key of Object.keys(raw)) if (!(story ? storyKeys : artworkKeys).includes(key)) problems.add(`${path}.${key}`, 'This field is not editable.');
    if (typeof raw.id !== 'string' || !/^[a-z0-9][a-z0-9-]{1,38}$/.test(raw.id)) problems.add(`${path}.id`, 'Not valid.');
    else if (ids.has(raw.id)) problems.add(`${path}.id`, 'Duplicate slide.');
    ids.add(raw.id);
    const slide = {id: raw.id, enabled: raw.enabled !== false, kind: raw.kind};
    slide.label = plain(raw.label, `${path}.label`, 80, problems, {required: false});
    slide.title = plain(raw.title, `${path}.title`, 120, problems);
    if (story) {
      if (!Array.isArray(raw.lines) || raw.lines.length < 1 || raw.lines.length > 3) problems.add(`${path}.lines`, 'Enter between 1 and 3 headline lines.');
      slide.lines = (Array.isArray(raw.lines) ? raw.lines : []).slice(0, 3).map((line, i) => plain(line, `${path}.lines[${i}]`, 60, problems));
      slide.emphasis = plain(raw.emphasis, `${path}.emphasis`, 40, problems, {required: false});
      slide.description = plain(raw.description, `${path}.description`, 300, problems);
    }
    const checked = checkHref(raw.cta?.href, ctx.config);
    if (checked.error) problems.add(`${path}.cta.href`, checked.error);
    for (const key of Object.keys(raw.cta ?? {})) if (!['label', 'href'].includes(key)) problems.add(`${path}.cta.${key}`, 'This field is not editable.');
    slide.cta = {label: plain(raw.cta?.label, `${path}.cta.label`, 40, problems), href: checked.href ?? ''};
    const duration = raw.duration;
    if (!Number.isInteger(duration) || duration < heroLimits.durationMin || duration > heroLimits.durationMax) problems.add(`${path}.duration`, `Choose between ${heroLimits.durationMin / 1000} and ${heroLimits.durationMax / 1000} seconds.`);
    slide.duration = Number.isInteger(duration) ? Math.min(Math.max(duration, heroLimits.durationMin), heroLimits.durationMax) : 12000;
    slide.desktopMedia = await checkHeroMedia(raw.desktopMedia, `${path}.desktopMedia`, slide, ctx, problems, {allowVideo: story, required: true});
    slide.mobileMedia = await checkHeroMedia(raw.mobileMedia, `${path}.mobileMedia`, slide, ctx, problems, {allowVideo: story, required: false});
    if (story && raw.featuredMedia) slide.featuredMedia = await checkFeatured(raw.featuredMedia, `${path}.featuredMedia`, ctx, problems);
    slides.push(slide);
  }
  if (forPublish && !slides.some(slide => slide.enabled)) problems.add('slides', 'Turn on at least one slide before publishing.');
  return {value: {slides}, problems};
}

// ---------------------------------------------------------------- defaults (what the site shows before any publish)
export function defaultHero() {
  return {slides: heroSlides.map(({order, published, photoLayout, ...slide}) => ({...slide, enabled: published !== false, mobileMedia: slide.mobileMedia ?? null}))};
}
export const defaultHomepage = () => JSON.parse(JSON.stringify(homepageDefaults));

export function validationContext({config, mediaLookup, previous = []}) {
  const panels = new Map();
  const positions = new Map();
  for (const doc of [defaultHero(), ...previous]) {
    for (const slide of doc?.slides ?? []) for (const which of ['desktopMedia', 'mobileMedia']) {
      const media = slide[which];
      if (!media?.src) continue;
      if (media.panel !== undefined) panels.set(`${slide.id}|${which}|${media.src}`, media.panel);
      if (media.position) positions.set(`${slide.id}|${which}|${media.src}`, media.position);
    }
  }
  return {config, mediaLookup, panels, positions, storyIds: new Set(knownStories.map(s => s.id)), partnerIds: new Set(knownPartners.map(p => p.id))};
}
