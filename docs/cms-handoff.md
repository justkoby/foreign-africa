# Editorial backend handoff

Status: frontend models plus a proposed Supabase migration and import seed. No database has been provisioned, no migration executed, and no editor dashboard or persistence wired to the site. The preview uses bundled content.

## Required forms and events scope

Cursor must include configurable application, submission, volunteer, event registration, partnership/sponsorship enquiry, speaker request, general contact and job application forms in the CMS. Follow [the forms build specification](cursor-cms-forms-spec.md) and `cms/form-definition.schema.json`. Forms and private submission review are future implementation work; current opportunity/event pages retain email enquiries and have no live registration/application endpoint. Add separate event content with date/time-zone handling and reviewed migrations; the original content_items kind constraint does not support these new types yet.

## Proposed platform

Keep the current React + Vite preview for design review. Next.js + Supabase is the recommended production direction when implementing the news site and editor dashboard. Next.js offers server-rendered content and per-story metadata; Supabase provides database, Auth and media storage. React + Vite can also connect to Supabase without a framework migration. This is a recommendation, not a completed migration.

## Content contracts

- News: title, slug, publication date, event date, location, category, summary, paragraph/heading blocks, original source URL, cover image, gallery, alt text, homepage feature position.
- Events: title/slug, summary/body, publication state, source/provenance, cover, announced date, UTC start/end where confirmed, IANA time zone, date-only/unknown-time-zone flag, venue/online format, cancellation, registration mode, form_id/external destination and verified recording link. Keep article publication dates distinct from event dates and reevaluate event state on page load and over time. See src/pages/events-content.js for the current announcement snapshot.
- Engage and careers: editable service overviews, approved departmental contacts, enquiry routing, vacancy records with status/dates and verified application destination; integrate versioned private enquiry/job forms under the extended form contract. Current Contact uses an email-draft composer, not server submission.
- Opportunity calls and forms: separate overview pathways from specific calls/roles/editions and their versioned forms; private submissions are not public content. Follow docs/cursor-cms-forms-spec.md.
- Hero: order, story/artwork type, desktop media, optional mobile media, title/copy, CTA, featured recording, duration. No mobile upload must remain valid: fall back to desktop. Artwork must retain contain sizing and optional text overlay defaults to off.
- People: name, cohort, country as approved by editors, programme role, portrait, alt text, optional biography/profile destination, order, visibility. Current names/country labels are transcribed from the supplied poster, not independently verified bios. Replace poster crops with individual approved portraits when available.
- About: heading, body blocks, images and captions.
- Recording: title, date, thumbnail, hosted video or allowlisted YouTube URL, transcript and publication state.

The proposed migration holds these as typed `kind` rows with a JSON payload matching the frontend modules. The import seed captures the existing models. Production validation must enforce each payload contract before publish; database JSON-object validation alone does not validate these fields.

## Editorial workflow to implement

Invite-only editor sign-in; media upload; add/edit; preview desktop/mobile; save draft; reorder; publish/unpublish; archive. Keep original photos separately from enhanced promotional images and retain source/alt/caption metadata. Require an original source link or provenance note for every news item. Preview drafts only with an authenticated editor session. Never make drafts publicly queryable.

Editor membership is granted through trusted server/database administration, never through public sign-up or user-editable profile metadata. The proposed RLS policies allow public published reads and editor-only writes. Test anonymous, ordinary signed-in user and editor sessions against a real Supabase project before launch. Keep service-role credentials server-side. Media buckets, upload validation/size/type limits and storage RLS are still to implement.

## Migration and release work

Preserve old WordPress article slugs, with canonical metadata and redirect mapping if routes change. Import full approved article bodies instead of only the homepage summaries. Generate story-specific metadata, sitemap and social preview images. Connect published content queries to the frontend and Smart Discovery so new publications appear automatically. Add editorial revision history, optimistic concurrency checks, backups and a rollback procedure before handing the dashboard to staff.

The seed retains query-string story routes for the current preview; convert those to preserved public slugs during the production route migration. Seed media paths assume these assets are deployed or imported into storage. No live backend readiness is claimed by the presence of this migration.

## Local commentary and internship migration
All 12 commentaries now have local full-text routes at their original slugs, plus `/blog/<slug>/` aliases. Keep those paths when publishing. Article bodies live in `public/content/commentaries/<id>.json`; preserve structured rich text, bylines, publication dates, featured/inline media, captions, links and provenance when adding the CMS. The reader renders an allowlist of editorial nodes, without arbitrary HTML. No old-site request is needed to read an article. All 46 inline images are local WebPs. Source metadata remains for attribution and migration audits.

The Remote Internship Programme is now a local opportunity detail page. All menu, hero, people, homepage, Careers, FAQ and Discovery links use `/remote-internship-programme-rip/`. No intake deadline or current opening is asserted. Add `internship_application` under the opportunity owner with a specific published intake and the same private review and versioned-form requirements in the forms spec. The schema contract now supports ten form purposes.
