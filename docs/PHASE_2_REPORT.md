# Phase 2 report

**Date:** 25 October 2026  
**Scope:** TipTap editing, media library, news and commentary management, public MySQL reads, and crawler HTML.  
**Not done:** deploy, DNS, production WordPress, Phase 3.

## What works in the repository

An editor can sign in at `/admin` when MySQL and `SESSION_SECRET` are configured. The studio edits news and commentaries with TipTap, drafts, direct publishing, revisions, a featured image, categories, tags, SEO fields, and a media library. The public news and commentary pages read only the public API. Article URLs include the article in the first HTML response and then let React draw the existing design.

This machine has no MySQL. Those public pages currently show “The staff database is not configured.” Uploads stay off until `MEDIA_ROOT` is set.

## Editor

TipTap 2.27. Paragraphs, headings 2–4, bold, italic, underline, bullet and numbered lists, blockquotes, links, images with captions, horizontal rules, undo, and redo. The toolbar is one row. The sidebar holds publishing, details, the category, the featured image, and SEO, and collapses on a narrow screen.

The document is stored as JSON. `server/document.js` whitelists the nodes and writes the HTML. A Phase 1 `{text}` body becomes paragraphs. Editorial commentary trees become the same document, including figures. Unknown wrapper tags are descended so an image inside them is kept.

Saving a draft records a revision. Restoring a revision writes a new revision and returns the article to draft. Autosave runs only for an existing draft, after four seconds, and cannot publish. Leaving the page with unsaved changes asks for confirmation.

## Media

JPEG, PNG, WebP, GIF, and PDF. Signature checks, 8 MB images, 15 MB PDFs, random names, dimensions, and sharp thumbnails for still images. GIF is stored unchanged. SVG is rejected. Referenced files cannot be deleted. Existing `public/images/` files are registered, not copied. See `docs/MEDIA_STORAGE.md`.

## Public site

`/news/` and `/blog/` call `/api/public/content`. A database error is shown on the page. The JSON catalogue is not used as a fallback. Events still come from the file editor. The homepage, programmes, and the discovery assistant are unchanged. The discovery directory is still the static seed, which is a second source for search summaries only.

## Tests and browser

`node --test tests/*.test.js` on 25 October 2026: 70 tests, 0 failures. `npm run build` succeeded.

In the browser at `http://localhost:5173/`, with no database configured:

- The homepage still shows the video hero, discovery prompt, intern section, programmes, and footer.
- `/news/` and `/blog/` keep their headings and show the database error, with Try again.
- `/events/` still lists the file-backed announcements.
- `/admin` shows the studio login and the unconfigured-database message.
- `/editor/` still shows its password login.
- Phone width opens and closes the navigation. Tablet width keeps the commentary heading and the error.

The signed-in editor was not clicked through in the browser, because there is no local database. The MySQL tests cover create, publish, revision restore, upload rejection, and the public HTML.

## Security notes

No new secret was committed. Drafts are excluded from the public API and the sitemap. Incomplete news redirect to the existing WordPress URL. Staging basic auth, `noindex`, and the production-canonical refusal are unchanged. The file editor can no longer overwrite news or commentaries.

## Blockers

- No confirmed Hostinger directory for `MEDIA_ROOT`.
- No persistent database has been seeded.
- Staging restore has not been run. The isolated table-and-file restore passed.
- Three news bodies and the programme pages in the WordPress plan still need an export.
