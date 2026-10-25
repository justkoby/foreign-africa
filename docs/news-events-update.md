# News, Events and future CMS forms

## Public frontend
The local /news/ page now has a featured latest published report, two-category archive, keyword/place search, an empty/reset state and programme-update links. Five published reports are sourced from Foreign Africa’s WordPress API, retrieved on 25 October 2026: the two reports visible on /news/ plus three community/institutional reports outside the Blog/commentary category. Publication dates retain the source metadata. The Africa–Europe report was published 1 February 2026 but describes a conference held 2–4 October 2025; those dates are intentionally separate.

Two report cards open the existing local mission/Johannesburg adaptations. The other three open their original published URLs. Full original bodies for those three have not been migrated; preserve or migrate those routes before a WordPress domain cutover. News search is local and does not call an AI service. Keyword matches and category filtering include the featured item when filters are active, with no duplicate card.

The local /events/ calendar shows an honest empty upcoming state and a past-announcement archive. Three dated announcements are included: EDWS Session 2 (26 June 2026), EDWS Session 4 (9 October 2026), and the cohort ceremony (23 October 2026). Each has its own /events/<id>/ detail route. Dates passing do not establish that the announced event took place. No attendance, completion or recording is inferred. The ceremony’s announced time lacks a confirmed time zone; the UI says so rather than assuming GMT.

The original Events page still advertises registration for the June session. Its stale Teams registration link is not carried into the rebuilt past-event UI. Current records have no active form or registration destination. A future/current event cannot show a real registration action until the CMS publishes and verifies its form/destination. Event state uses supplied UTC start/end instants or coarse date-only handling when exact timing is absent. In-progress events remain in the upcoming/current list. Cancelled events are excluded from that list.

## Sources and media
- https://foreignafrica.org/news/
- https://foreignafrica.org/events/
- Five report-specific source and image URLs retained in src/pages/news-content.js.
- The June poster is sourced from https://foreignafrica.org/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-18-at-11.43.46.jpeg.
- October event details reuse the supplied announcement evidence already documented in src/activities.js and docs/content-sources.md.

Five featured images and the June poster are stored locally as resized WebP assets. Source images have not been AI-retouched by this update. Poster images use contain presentation where appropriate; original historical poster text is retained as source artwork while current registration status is stated in the page.

## CMS requirement added for Cursor
Read docs/cms-handoff.md and docs/cursor-cms-forms-spec.md. The user has requested forms in the future CMS: fellowships, paper submissions, volunteering and event registration. cms/form-definition.schema.json supplies a constrained field-builder contract. The specification covers owner relations, drafts/open/closed scheduling, immutable versions, private submissions/files, reviewer access, audit/export, validation, consent, error/success behaviour and acceptance tests. Existing opportunity models now expose formId=null and actionMode='enquiry'; events expose formId=null with unavailable registration.

This is an actionable build specification, not a working forms backend. No database schema was executed, no endpoint/dashboard was connected and no emails were sent. Cursor must create reviewed migrations beyond the existing public content_items kinds and keep private submissions separate from public content and search. The site continues to use email enquiries.

## Shared navigation and discovery
Header and footer link to /news/ and /events/. /news-events/ aliases News. The existing homepage activity section and story routes remain valid. Discovery includes the new archives, additional reports and event announcements. Tie-breaking favours programme/opportunity information for ambiguous navigation queries, then existing local story bodies over duplicate announcement metadata. Existing source IDs remain stable, including the internship entry.

## Validation
All 41 Node tests and the production build pass. Tests cover news filtering, source/local media, canonical event routes, date-only and exact UTC boundaries, in-progress inclusion, no upcoming events in the supplied snapshot, and the inert future-forms contract. Browser checks exercised news category/search/reset, News/Events navigation, the past filter, June detail navigation and 390px/320px layouts. No GitHub push or deployment was performed.
