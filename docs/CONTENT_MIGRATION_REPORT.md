# Content migration report

**Date:** 25 October 2026  
**Command:** `npm run seed-content`  
**Where it ran:** the in-memory MySQL database in `tests/phase2-mysql.test.js`  
**Where it did not run:** this machine’s `.env.local` has no database, and nothing was written to staging or production.

The command is safe to run again. A `(content_type, slug)` that already exists is skipped and is not overwritten.

## Commentaries

All 12 published catalogue rows were inserted. Each body file in `public/content/commentaries/{id}.json` was present. A comparison of the source text with the TipTap text kept at least 90 percent of the characters for every article. None were shorter than that threshold. The Ghana article’s published date is 12 October 2026 and its HTML contains the sentence that names Samuel Okudzeto Ablakwa.

Preserved: title, slug, authors joined with ` · `, publication date at noon UTC, topic as the category, tags, cover image, and inline images. Commentary links to `foreignafrica.org/{slug}/` are rewritten to `/{slug}/`. Other WordPress links stay absolute. The newest catalogue row is marked featured.

Images stay in `public/images/` and are registered as `site:` media rows. No image file was copied or deleted.

Public routes after a real seed: `/{slug}/` and `/blog/{slug}/`. The canonical URL is `/{slug}/`.

## News

| Legacy id | Slug | Body | Public behaviour |
| --- | --- | --- | --- |
| 7277 | `foreign-africa-concludes-ethiopia-and-rwanda-mission-enters-90-day-follow-up-phase` | Paragraphs from the local activity `continental-mission-follow-up` | `/news/{slug}/` |
| 6164 | `foreign-africa-participates-in-the-education-collaboratives-southern-african-convening-in-johannesburg` | Paragraphs from the local activity `johannesburg-convening` | `/news/{slug}/` |
| 6231 | `foreign-africa-junior-associate-participates-in-policy-discussion-on-xenophobia-migration-and-african-integration` | Empty | Card and URL redirect to the existing WordPress article |
| 6227 | `foreign-africa-introduces-its-inaugural-remote-internship-cohort` | Empty | Same |
| 6184 | `foreign-africa-participates-in-africa-europe-cooperation-conference-in-france-and-germany` | Empty | Same |

Dates, categories, locations, summaries, and cover images come from `data/cms/news.json`. The byline stored for every news row is “Foreign Africa”, because the catalogue has no personal byline. Replace it from the WordPress export when those articles are imported. Do not treat it as a person’s name.

Homepage cards for 7277 and 6164 still open `/?story=`. Those homepage pages were not switched to MySQL.

## Drafts and duplicates

The test published a draft in the same database and confirmed it was absent from the public list and from the sitemap. Repeating the seed did not insert a second copy of the 12 commentaries.

## Still blocked

The three empty news bodies, six programme or hub pages in `docs/WORDPRESS_MIGRATION_PLAN.md`, and any WordPress post that is not already in this repository. No export was available. Those bodies were not written.
