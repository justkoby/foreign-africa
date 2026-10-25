# About, people and mega-menu update

This update extends the React + Vite project delivered in `foreign-africa-people-news-update.zip`, baseline commit `bbcd16a`. It does not contain the user's subsequent local Cursor changes (Mark Pro binaries, environment values, Gemini configuration, assistant launcher or other local fixes). Merge into the current working copy; do not replace that copy with the reference snapshot.

## Implemented

- About at `/who-we-are/`, with aliases `/about-us/` and `/our-mission-vision/`. Purpose, mission, vision, approach, five values, real photography, people links and closing CTA.
- Advisory Council at `/advisory-council/`, Executive Leadership at `/executive-leadership/`, Secretariat at `/secretariat/`, and Junior Associates at `/junior-associates/`. `/our-people/` opens the council group.
- Ten complete supplied biographies at `/people/<member-id>/`. Only supplied email/location/LinkedIn details are displayed. Portraits copied unchanged; no face editing or generated replacements.
- Rexford Akrong, Nana Osei Agyekum and Abdul Karim Ibrahim now have complete executive profiles with the newly supplied biographies and portraits. Emmanuel Nuvi Junior and James Kodjie have complete Secretariat profiles. Adewumi Adeola Adeoye, Daniel Torgbor Obodai and Caleb Tettey are listed with their screenshot-supplied roles; no unsupplied biographies or contacts are inferred for them.
- Desktop click-to-expand mega menu for six navigation categories, with selected organisation and people pages local. Other programme/research/contact destinations still lead to their existing site pages.
- Mobile disclosure navigation, Escape handling, body scroll lock and focus return. Opening search reuses the parent discovery state and trigger focus.
- Reusable InnerHero, ClosingCTA, PersonCard and structured content modules. Scoped styles avoid replacing homepage CSS or font definitions.
- Directory search now includes About, people groups and supplied biographies. New categories are imported by the existing endpoint validator automatically. Gemini still receives directory summaries only, not full biographies.
- Back to top scrolls the window and returns focus to the header home link, respecting reduced motion.

## Content sources

About copy is lightly edited from the seven supplied legacy screenshots. The ten biographies are supplied by the user, retained in full with minor punctuation/readability edits. Current professional positions and biographical claims are supplied editorial content, not independent employment verification. The Secretariat screenshot confirms a fourth team group and supplies the three remaining names/roles. The Junior Associates group reuses the existing provided poster portraits; it does not assert a new intake.

The Africa Practice About page was the requested design direction. Live rendering could not be retrieved through the research tool; this implementation follows the discussed editorial structure and existing Foreign Africa design rather than claiming a pixel-identical reproduction.

## Integration

Copy additive modules and assets under `new-files/` from the update archive. Existing-file examples are under `merge-reference/`; merge the changes into the current files, preserving newer work. The archive's `integration.patch` is a reference against `bbcd16a`, not an instruction to force-apply over a diverged project.

The parent App passes this header interface:

```jsx
<SiteHeader
 scrolled={scrolled}
 solid={Boolean(currentStory)}
 menu={menu}
 setMenu={setMenu}
 menuTrigger={menuTrigger}
 searchTrigger={searchTrigger}
 onSearch={trigger => {
   returnFocus.current = trigger;
   setSearch(true);
 }}
/>
```

Resolve `window.location.pathname` with `resolvePage` before rendering the homepage or query-string story. Render `<InnerPages route={currentPage}/>` when resolved. Keep the existing discovery dialog, assistant launcher, credential handling, mobile hero behaviour and font definitions. SiteHeader exports Brand so the shared footer can retain its logo.

If the current app already uses a router, integrate these pages into it rather than maintaining a second routing system. Our reference uses full document navigation, so deep links and browser history work with an SPA fallback. Production hosting must serve the app shell for these page paths without rewriting `/api/*` or static files. Preserve any existing hosting/API configuration and add only needed SPA fallback rules.

For existing-file changes, `src/main.jsx` replaces the header and adds route/title selection, local About links and the Back to top fix; `src/discovery.js` adds the new directory/categories and accent-normalised matching; `scripts/export-content.mjs` includes About and biographies in the draft seed. Do not overwrite newer logic in these files.

## CMS status

No live Supabase changes or dashboard integration were performed. New content lives in editable source models, with a draft seed refresh. Production CMS needs group, role, portrait, biography, optional contacts and publication/order fields for people; About needs structured sections and media. Menu configuration is currently static. Existing RLS migration remains a proposal, not an applied database schema.

## Validation

26 automated checks pass, including new route, menu-target and directory tests. Production build passes. Browser checks covered desktop About, council cards, complete chair biography, mega menu, Escape/focus return, Back to top, mobile About and mobile navigation into Executive Leadership. The latest five content additions and fourth group passed the build and 26 checks; this pass could not repeat browser inspection because the browser could not load the restored preview. Earlier browser checks apply to the shared page/menu components, not a visual check of these new portraits. No real Gemini request or Supabase persistence was tested. Licensed Mark Pro font files are only in the user's local project and must be retained there.

## Revised package

This cumulative revision supersedes the first About/team update. If that update is already merged, reconcile the changed team-content module, the fourth group and menu link, contact rendering, stylesheet adjustments, tests and refreshed draft seed. Preserve any subsequent Cursor edits. The revised source has 3 council profiles, 5 executive profiles and 2 Secretariat profiles; the original 10 interns remain in Junior Associates. Nana’s supplied phone number uses a tel link; supplied generic contact links are retained for Nana and James. Abdul’s old profile URL is stored as provenance rather than mislabeled as a contact destination. No email or location is inferred for Emmanuel.
