# Foreign Africa

React + Vite homepage redesign, using Africa Practice as the lead layout reference and preserving Foreign Africa’s navy/gold identity.

## Run

```sh
npm install
npm run dev
npm test
npm run build
```

Deploy the generated `dist` directory to a static host (Vercel preset: Vite).

## First design pass

Responsive homepage, mobile navigation, keyboard-accessible search dialog with category filters, programme accordion, focus areas, opportunities and partnership routes. Content and locally stored brand/photography assets come from foreignafrica.org. Programme and research detail links intentionally point to the current website during the rebuild. No open application status, invented publication titles, impact statistics or testimonials are implied.

The research illustration is decorative, not a data visualisation. Smart discovery supports natural-language topic matching, category filters, suggested questions and source links. An optional server-side Gemini guide can summarise the matched directory entries. No API key is required for directory search. The CMS, authentication, subscriptions, full document migration and transcript search are not implemented yet.

## Assets

`public/images/engagement.jpg` and `partners.webp` are sourced from the existing Foreign Africa website. The wordmark is rendered as text alongside the brand symbol. Header and footer use `public/images/logo-mark.svg`, a white version of the supplied `logo.svg` so the mark stays visible on the navy header. The original navy file is `public/images/logo-navy.svg`. DM Sans remains the fallback if Mark Pro does not load.


## Smart discovery

- The homepage discovery field and navigation search open the same accessible dialog.
- The catalogue in `src/discovery.js` contains public page descriptions only. It is not a research or transcript index. Opportunity status is explicitly unverified.
- Questions are submitted to `/api/discover` only after the visitor submits the form or chooses a suggestion/category. Nothing is sent to Gemini on each keystroke.
- Matching pages remain available without credentials, with an honest directory-only label. Missing recordings return a clear empty state; no timestamps or summaries are invented.
- Generated answers are plain text, with source IDs checked against the retrieved directory and links resolved on the server. This guards source identity, but cannot guarantee semantic correctness of generated text.

### Enable AI directory answers on Vercel

Deploy the whole repository using the Vite preset, not just the `dist` folder. The `api/discover.js` Node function must be included. Add `GEMINI_API_KEY` and `GEMINI_MODEL` as server environment variables, selecting a currently available Gemini model supporting `generateContent` and structured JSON output. Redeploy after setting them. Never prefix the key with `VITE_` or commit an `.env` file. `.env.example` contains names only.

For local development, create an ignored `.env.local` file with those server variables and restart `npm run dev`. Vite's local middleware runs the same handler. Static-only hosting and `npm run preview` serve the UI; without a function runtime, AI requests fall back to local matches.

The endpoint caps input to 500 characters, uses a 10-second provider timeout, limits response tokens and implements best-effort per-instance request throttling. Before enabling a paid key on public production, configure shared rate limiting / provider spending quotas; instance-local limits reset on cold starts and do not form a global cost cap. The UI identifies Google AI processing before submission. The app does not persist or log questions.

### Validation

`npm test` checks natural-language retrieval, missing content, opportunity status notices, input validation, citation rejection, provider outages, credential isolation and endpoint throttling with mocked provider calls. `npm run build` verifies the frontend bundle. A real Gemini call still needs configured server credentials and a deployed/local runtime.


## Video hero and responsive banners

The lead hero uses the supplied Cloudinary video (1920×1080, 10 seconds), with a local poster fallback. The two additional slides use the supplied workshop and interns flyers, including their separate mobile versions. Workshop content is labelled as a past event rather than an open registration.

`src/hero-content.js` holds the slide model: published flag, order, duration, desktop media, optional mobile media, copy, CTA and optional featured video. Omitting mobile media reuses the desktop asset. Banners use `object-fit: contain` so baked-in text and portraits are not cropped. This model is ready for CMS integration; dashboard editing, authentication and database persistence are not implemented yet.

The featured card currently plays the supplied brand film in an accessible dialog. A real meeting recording or YouTube link can replace it later; no meeting recording was supplied. YouTube embed conversion only accepts recognized YouTube hosts and valid IDs.

Desktop uses a sticky hero beneath the content layer so the next section rises over it. Mobile and reduced-motion layouts use normal scrolling. Slideshow controls support manual navigation, touch swipes and pause. Automatic slide changes pause on hover/focus, hidden tabs, an open player and when covered by content. Background video pauses for manual pause, hidden tabs, an open player, reduced motion and when covered.

The selected font stack is Mark Pro with DM Sans/system fallbacks. Supplied files in `fonts/` are registered in `src/fonts.css` at each file’s OS/2 weight: Thin 275, ExtraLight 300, Light 350, Regular 400, Book 450, Medium 500, Bold 700, Heavy 800, Black 900 and Ultra 950, plus the italics that were included. There is no 600 or 650 file, so those CSS weights resolve to Bold. Narrow cuts are a separate family and are not mixed into the proportional text. Icons throughout the site use Lucide SVG components, with no emoji icons.

## Activity content added from supplied screenshots

Five activity stories now have local, shareable query-string routes (`/?story=...`), original-source notes and linked photo galleries where available. The homepage includes an EDWS evidence strip, a Kigali mission feature, three activity cards, and the real EDWS registration snapshot in place of the decorative research chart. Smart Discovery indexes these as Updates. Two extra desktop hero slides use enhanced mission photography; their mobile versions retain the original photos.

See `docs/content-sources.md` for the evidence scope and photo-edit prompt set. Enhanced promotional image backgrounds were extended with AI; originals are retained unchanged for article photography. No open vacancy, completed partnership, UN attendance, workshop attendance count or jobs-created claim has been inferred from announcements or registration totals. These editorial stories are static source-backed summaries until the CMS is connected.

## Published reports, people and header update

Two additional stories adapt the supplied September mission report and February Johannesburg report, retaining links to their published originals. The homepage now leads with the mission follow-up and includes the convening photograph in Who We Are. A scroll-highlighted people section uses all ten portraits from the supplied interns poster without AI edits. Desktop introduction stays sticky; mobile and reduced-motion layouts use regular flow. The header overlays the hero transparently at the top and turns blue on scroll; article pages use blue immediately. Primary button sizing, radius, type and hover states share one treatment.

The new embassy hero uses an AI-assisted office extension and subtle colour/light correction, while article and mobile photographs retain the supplied originals. See `docs/content-sources.md` for prompt/provenance. See `docs/cms-handoff.md` for the backend contracts, `supabase/migrations/202610250001_content.sql` for a proposed RLS foundation and `supabase/content-seed.json` for draft import data. These are preparation files, not a working CMS. No live database or editor account has been configured.

## About, people and mega menu

Local inner pages now include `/who-we-are/`, `/advisory-council/`, `/executive-leadership/`, `/secretariat/`, `/junior-associates/` and ten individual `/people/.../` biographies. `src/pages/` contains the reusable page system and supplied editorial content; `src/SiteHeader.jsx` and `src/menu-content.js` provide shared desktop mega menus and mobile disclosure navigation. See `docs/about-team-update.md` for integration, provenance and validation limits. The production host must support SPA deep links while preserving API and asset routing. CMS persistence remains pending.

## Partners and policy briefs

`/partners/` now provides individual partner cards, using the existing six partner names and marks. The homepage uses the same model (`src/partners.js`) for a continuous logo strip with a pause button, hover/focus pause, and a manually scrollable reduced-motion layout. Four logos use supplied source assets; GFZA and IPPA are extracted from the existing strip and retain its lower resolution. No external partner destinations or specific relationship claims have been invented.

`/policy-briefs/` presents the supplied July and September 2026 briefs with their real covers, issue metadata, source-based summaries and takeaways. The reader opens on demand, with page selection, previous/next, zoom, an expanded dialog (Escape and keyboard focus containment), reflowed selectable text and original PDF open/download links. Page images preserve the document layout across mobile browsers. Text extraction can lose chart/table structure; the interface points readers to Original for those. PDFs are not downloaded on catalogue load; the reader module and individual reading assets load on demand.

Original PDFs, cover thumbnails, page images and extracted text live in `public/documents/policy-briefs/<slug>/`. Run `python scripts/render-policy-briefs.py` with PyMuPDF and Pillow installed to regenerate derived assets after replacing a PDF. Update `src/pages/policy-content.js` if page counts or metadata change. Summaries and takeaways are editorial adaptations of the supplied documents, not independent verification of their claims. Future CMS publication must generate these assets and validate page counts before publishing. No live database changes are included.

Navigation, homepage policy links and Smart Discovery now point to these local routes. Validation: 29 Node tests, production build, and browser checks of desktop layouts plus 390px iframe viewports; publication reader page navigation, text mode and expansion were exercised.

## Commentaries archive

The `/blog/` listing now includes a featured commentary, twelve source-backed publication records, local WebP images, named bylines, approximate reading times, keyword/topic/year filters, date ordering and progressive loading. All twelve full article bodies and 46 inline images are served locally at their original article slugs, with `/blog/<slug>/` aliases and a responsive reading layout. `/commentaries/` and `/category/blog/` are aliases. Navigation and Smart Discovery connect to the local archive and articles. See `docs/commentaries-update.md` for provenance, validation and the WordPress cutover requirement.

## Opportunities overviews

The homepage now introduces Fellowships, Calls for Papers, Volunteer Opportunities and Enterprise Week through shared pathway cards. `/opportunities/` and four local overview pages provide clear programme introductions, status messages, focus areas, email enquiries and related routes. Existing opportunity URLs are retained; the Remote Internship Programme keeps its separate original page. No live call, application, registration, email sending or subscription backend is implied. See `docs/opportunities-update.md` for content provenance, availability handling and publishing requirements.

## News, Events and required CMS forms

`/news/` now presents five published reports with a featured story, search/category controls and programme updates. `/events/` separates upcoming listings from past announcements, with three local event-detail routes. Original publication dates and event schedules remain distinct; expired registration links are not exposed as active actions. Read `docs/news-events-update.md` for source and migration scope.

The future CMS must include configurable forms for fellowships, papers, volunteering and event registration. Cursor should read `docs/cms-handoff.md`, `docs/cursor-cms-forms-spec.md` and `cms/form-definition.schema.json` before building the dashboard. These specify the builder, versions, private submissions/review and publication rules; no forms backend is connected yet.

## Engage and Contact

`/engage/` connects the local Partner with us, Sponsor a programme, Book a speaker, Careers and Contact pages. Contact preserves the published departmental emails and provides a browser-only email-draft composer with topic handoff, validation and Copy fallback. It sends and stores no submission. The stale Institutional Partnerships Officer search result is labelled expired based on its source detail page. See `docs/engage-update.md`.

The required future CMS forms scope now includes partnership/sponsorship enquiries, speaker requests, general contact and job applications as well as the earlier four types. Cursor should follow the updated master handoff, forms specification and JSON schema before building actual submission/review services.

The Remote Internship Programme is now built into `/remote-internship-programme-rip/`; opportunity navigation, homepage, hero, People, Careers and FAQ links stay local. Future internship intake forms are included in the CMS form contract. See `docs/local-content-update.md`.
