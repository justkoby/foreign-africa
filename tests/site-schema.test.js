import test from 'node:test';
import assert from 'node:assert/strict';
import {checkHref, defaultHero, defaultHomepage, homepageSections, validateHero, validateHomepage, validationContext} from '../server/site-schema.js';
import {heroSlides} from '../src/hero-content.js';
import {homepageDefaults} from '../src/homepage-defaults.js';
import {slideFromDocument, withDefaults} from '../src/site-content.js';

const config = {publicSiteUrl: 'https://staging-example.hostingersite.com', ctaExtraHosts: ''};
const rows = {1: {mime_type: 'image/png', storage_path: 'files/a.png'}, 2: {mime_type: 'application/pdf', storage_path: 'files/b.pdf'}};
const ctx = (previous = []) => validationContext({config, mediaLookup: async id => rows[id] ?? null, previous});
const messages = problems => problems.list.map(p => `${p.path}: ${p.message}`);

test('the live homepage content passes validation unchanged (publishing the defaults changes nothing)', async () => {
  const {value, problems} = await validateHomepage(defaultHomepage(), ctx());
  assert.deepEqual(messages(problems), []);
  assert.deepEqual(value, homepageDefaults);
  assert.deepEqual(withDefaults(homepageDefaults, value), homepageDefaults);
});

test('the live hero slides pass validation and rebuild exactly the slides the site renders today', async () => {
  const {value, problems} = await validateHero(defaultHero(), ctx(), {forPublish: true});
  assert.deepEqual(messages(problems), []);
  // `order` is only the sort key; the editor uses the slide's position, which yields the same sequence.
  assert.deepEqual(value.slides.map(slideFromDocument), heroSlides.map((slide, index) => ({...slide, order: index})));
  assert.deepEqual(heroSlides.map(slide => slide.id), [...heroSlides].sort((a, b) => a.order - b.order).map(slide => slide.id), 'the current order is already the sort order');
});

test('every homepage section is covered by the editing contract', () => {
  assert.deepEqual(homepageSections.map(s => s.key).sort(), Object.keys(homepageDefaults).sort());
  for (const section of homepageSections) assert.deepEqual(Object.keys(section.fields).sort(), Object.keys(homepageDefaults[section.key]).sort(), section.key);
});

test('developer-only things cannot be sent: markup, layout, CSS, scripts and unknown sections are rejected', async () => {
  const doc = defaultHomepage();
  doc.about.className = 'hero-giant'; doc.about.style = 'display:none'; doc.about.html = '<script>x</script>';
  doc.layout = {columns: 7}; doc.css = 'body{display:none}';
  doc.focus.cards[0].component = 'Fancy';
  doc.about.lead = '<img src=x onerror=alert(1)>';
  const {problems} = await validateHomepage(doc, ctx());
  const text = messages(problems).join('\n');
  for (const expected of ['about.className', 'about.style', 'about.html', 'layout', 'css', 'focus.cards[0].component', 'about.lead: HTML and markup']) assert.ok(text.includes(expected), `expected a problem for ${expected}\n${text}`);
});

test('content limits and required fields are enforced', async () => {
  const doc = defaultHomepage();
  doc.about.heading = ['x'.repeat(61), ''];
  doc.about.paragraphs = ['only one'];
  doc.focus.cards.pop();
  doc.programmes.items = [];
  delete doc.connect.emphasis;
  const text = messages((await validateHomepage(doc, ctx())).problems).join('\n');
  for (const expected of ['about.heading[0]: Use 60', 'about.heading[1]: This field is required', 'about.paragraphs', 'focus.cards: Provide exactly 3', 'programmes.items', 'connect.emphasis: This field is required']) assert.ok(text.includes(expected), expected + '\n' + text);
});

test('links: internal paths, anchors, mailto and approved hosts only', () => {
  for (const ok of ['/who-we-are/', '/?story=johannesburg-convening', '/blog/#top', '#focus', 'mailto:info@foreignafrica.org', 'https://foreignafrica.org/contact/', 'https://www.foreignafrica.org/x', 'https://staging-example.hostingersite.com/news/']) assert.equal(checkHref(ok, config).href, ok, ok);
  for (const bad of ['', 'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,hi', '//evil.example/x', 'https://evil.example/', 'https://foreignafrica.org.evil.example/', 'https://evilforeignafrica.org/', 'http://foreignafrica.org/', 'https://user:pw@foreignafrica.org/', '/a/../b', '/path with space', '/\\evil', 'ftp://foreignafrica.org', 'mailto:not-an-email', 'tel:+233', '#a b', 'vbscript:x']) assert.ok(checkHref(bad, config).error, `should refuse ${JSON.stringify(bad)}`);
  assert.equal(checkHref('https://partner.example/', {...config, ctaExtraHosts: 'partner.example'}).href, 'https://partner.example/');
});

test('images must come from the library or the built-in site images; documents and arbitrary URLs are refused', async () => {
  const doc = defaultHomepage();
  doc.engagement.image = {mediaId: 1};
  assert.deepEqual((await validateHomepage({engagement: doc.engagement}, ctx())).value.engagement.image, {src: '/media/1', mediaId: 1});
  for (const bad of [{mediaId: 2}, {mediaId: 99}, {src: 'https://evil.example/x.png'}, {src: '/images/../server/app.js'}, {src: '/images/does-not-exist.jpg'}, {src: '/media/99'}, {src: '/images/engagement.jpg', onerror: 'x'}, null]) {
    const d = {engagement: {...doc.engagement, image: bad}};
    assert.ok((await validateHomepage(d, ctx())).problems.any, `should refuse ${JSON.stringify(bad)}`);
  }
});

test('stories and partners must be known; partner list needs one visible logo', async () => {
  const doc = defaultHomepage();
  doc.activity.lead = 'nope'; doc.activity.cards = ['a', 'a', 'b'];
  doc.partners.items = doc.partners.items.map(item => ({...item, visible: false}));
  const text = messages((await validateHomepage({activity: doc.activity, partners: doc.partners}, ctx())).problems).join('\n');
  for (const expected of ['activity.lead', 'activity.cards', 'partners.items: Show at least one']) assert.ok(text.includes(expected), expected + '\n' + text);
});

const mutateHero = fn => { const h = defaultHero(); fn(h); return h; };
const heroProblems = async (h, opts) => messages((await validateHero(h, ctx(), opts)).problems).join('\n');

test('hero: slide count, duration limits, unique ids, and one enabled slide to publish', async () => {
  assert.match(await heroProblems(mutateHero(h => { h.slides = []; })), /Keep between 1 and 8/);
  assert.match(await heroProblems(mutateHero(h => { h.slides[0].duration = 3000; })), /duration: Choose between 8 and 20/);
  assert.match(await heroProblems(mutateHero(h => { h.slides[0].duration = 99999; })), /duration/);
  assert.match(await heroProblems(mutateHero(h => { h.slides[1].id = h.slides[0].id; })), /Duplicate slide/);
  assert.match(await heroProblems(mutateHero(h => { h.slides.forEach(s => { s.enabled = false; }); }), {forPublish: true}), /at least one slide/);
  assert.equal(await heroProblems(mutateHero(h => { h.slides.forEach(s => { s.enabled = false; }); })), '', 'a draft may have everything switched off');
  assert.match(await heroProblems(mutateHero(h => { while (h.slides.length < 9) h.slides.push({...h.slides[3], id: `extra-${h.slides.length}`}); })), /between 1 and 8/);
});

test('hero: layout, behaviour and styling fields are not editable', async () => {
  const text = await heroProblems(mutateHero(h => { Object.assign(h.slides[0], {className: 'x', photoLayout: false, transition: 'fade', css: 'a{}', breakpoint: 500}); h.slides[0].desktopMedia.style = 'x'; h.transitionMs = 10; }));
  for (const expected of ['slides[0].className', 'slides[0].photoLayout', 'slides[0].transition', 'slides[0].css', 'slides[0].breakpoint', 'desktopMedia.style', 'transitionMs']) assert.ok(text.includes(expected), expected + '\n' + text);
});

test('hero: artwork slides cannot carry story-only or video content', async () => {
  const artwork = defaultHero().slides.find(s => s.kind === 'artwork');
  const text = await heroProblems(mutateHero(h => { h.slides = [{...artwork, lines: ['x'], description: 'x', featuredMedia: null}]; }));
  assert.match(text, /lines: This field is not editable/);
  assert.match(await heroProblems(mutateHero(h => { h.slides = [{...artwork, desktopMedia: {type: 'video', videoId: 'our-story-film'}}]; })), /takes an image/);
});

test('hero: video must be an approved video; YouTube links are reduced to an id; CTAs are checked', async () => {
  const story = defaultHero().slides[0];
  assert.match(await heroProblems(mutateHero(h => { h.slides[0].desktopMedia = {type: 'video', src: 'https://evil.example/x.mp4', poster: '/images/hero/story-poster.jpg'}; })), /approved videos/);
  const ok = await validateHero(mutateHero(h => { h.slides[0].desktopMedia = {type: 'video', videoId: 'our-story-film', poster: '/images/hero/story-poster.jpg'}; h.slides[0].featuredMedia = {label: 'Watch', title: 'Talk', type: 'youtube', src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5', thumbnail: '/images/hero/story-poster.jpg'}; }), ctx());
  assert.deepEqual(messages(ok.problems), []);
  assert.equal(ok.value.slides[0].featuredMedia.src, 'https://youtu.be/dQw4w9WgXcQ');
  assert.match(await heroProblems(mutateHero(h => { h.slides[0].featuredMedia = {label: 'x', title: 'x', type: 'youtube', src: 'https://evil.example/watch?v=dQw4w9WgXcQ', thumbnail: '/images/hero/story-poster.jpg'}; })), /youtube\.com/);
  assert.match(await heroProblems(mutateHero(h => { h.slides[0].cta.href = 'javascript:alert(1)'; })), /cta\.href/);
  assert.match(await heroProblems(mutateHero(h => { h.slides[0].desktopMedia.position = 'url(evil)'; h.slides[0].desktopMedia.type = 'video'; h.slides[0].desktopMedia.videoId = 'our-story-film'; })), /position/);
  void story;
});

test('hero: a crop treatment is kept only for the original image and cannot be added by an editor', async () => {
  const kigali = defaultHero().slides.find(s => s.id === 'kigali-mission');
  assert.equal(kigali.mobileMedia.panel, 0.528);
  const kept = await validateHero({slides: [kigali]}, ctx());
  assert.equal(kept.value.slides[0].mobileMedia.panel, 0.528);
  const swapped = await validateHero({slides: [{...kigali, mobileMedia: {type: 'image', mediaId: 1, alt: 'New photo', panel: 0.1}}]}, ctx());
  assert.equal(swapped.value.slides[0].mobileMedia.panel, undefined, 'replacing the picture drops the old crop');
});
