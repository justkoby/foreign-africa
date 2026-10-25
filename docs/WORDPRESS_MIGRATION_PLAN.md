# WordPress migration plan

The production WordPress database has not been read or changed. Nothing in this plan deletes WordPress content. `npm run seed-content` copies only the files already in this repository. It has been executed against the in-memory test database, not against staging or production.

## Blocked on an export

The repository does not contain a WordPress WXR export or REST credentials. These records cannot be copied faithfully until an editor provides one. They are not skipped as empty pages.

| Source | Type | In this repository | Proposed URL | Status |
| --- | --- | --- | --- | --- |
| `/foreign-africa-junior-associate-participates-in-policy-discussion-on-xenophobia-migration-and-african-integration/` | News | Title, date, summary, local image. The card still opens WordPress | `/news/{slug}/` | Missing article body |
| `/foreign-africa-introduces-its-inaugural-remote-internship-cohort/` | News | Same | `/news/{slug}/` | Missing article body |
| `/foreign-africa-participates-in-africa-europe-cooperation-conference-in-france-and-germany/` | News | Same | `/news/{slug}/` | Missing article body |
| `/africa-trade-job-tracker-atjt/` | Programme | Menu and resource links only | `/{slug}/` | Missing page |
| `/enterprise-development-workshop-series-edws/` | Programme | Menu, hero, and resource links only | `/{slug}/` | Missing page |
| `/skillshareforeignafrica/` | Programme | Menu and resource links only | `/{slug}/` | Missing page |
| `/municipal-diplomacy-programme-mdp/` | Programme | Menu and resource links only | `/{slug}/` | Missing page |
| `/research/` | Page | Homepage link only | `/research/` | Missing page |
| `/programmes/` | Page | Homepage link only | `/programmes/` | Missing page |

The export may contain more posts than this list. Compare its counts with the table below before importing. Do not invent the missing bodies.

## Ready to seed from this repository

`npm run seed-content` inserts these when a super administrator exists. A slug that already exists is left unchanged. Details and the test result are in `docs/CONTENT_MIGRATION_REPORT.md`.

| Type | Count | Source | Public URL | Status |
| --- | --- | --- | --- | --- |
| Commentary | 12 | `data/cms/commentaries.json` and `public/content/commentaries/{id}.json` | `/{slug}/`, also `/blog/{slug}/` | Seeded in the test database. Canonical is `/{slug}/` |
| News with a local story | 2 | ids 7277 and 6164, bodies from `src/activities.js` | `/news/{slug}/`. Homepage `/?story=` cards are unchanged | Seeded in the test database. The story text is the local activity copy, not a WordPress export |
| Events | 3 | `data/cms/events.json` | `/events/{id}/` | The shared WordPress `/events/` page needs the export before a redirect |
| Team | 10 profiles, 3 name-only rows | `data/cms/people.json` | `/people/{slug}/` | `sourceUrl` values such as `/teams/abdul/` redirect only after the profile is confirmed |
| Partners | 6 | `src/partners.js` | `/partners/#{id}` | No WordPress partner URLs are stored |
| Policy briefs | 2 | `public/documents/policy-briefs/` | `/policy-briefs/#brief-{issue}` | Keep the local PDF |
| Engage | 3 services | `data/cms/engage.json` | Existing `/partner-with-us/`, `/sponsor-a-programme/`, `/book-a-speaker/` | 301 from the same WordPress paths |
| Opportunities | 5 overviews | `src/pages/opportunities-content.js` | Existing pathway paths | Do not present them as open calls |
| Expired vacancy | 1 | `archivedVacancies` in engage JSON | `/careers/` | Keep it marked expired |

Authors and dates for the 12 commentaries are in the catalogue. News cards have no personal byline, so the seed stores “Foreign Africa” until an export supplies the person. Do not invent a person’s name. Events, team, partners, briefs, engage, and opportunities in the table above are still file-backed and are not part of `npm run seed-content`.

## Import rules, when a database is approved

1. Import into the staging database only.
2. Match on the WordPress slug. Do not create a second row when the slug already exists.
3. Copy files into `MEDIA_ROOT`, not into `public_html`.
4. Leave WordPress status as it was. Drafts stay drafts.
5. Add a `redirects` row only after the new URL returns the article.
6. Write the counts, missing images, and duplicate slugs into `docs/CONTENT_MIGRATION_REPORT.md`.

## Needed from Foreign Africa

- A WordPress export (Tools → Export, all content) or a REST application password used only against a read-only request.
- Confirmation of which programme pages should become pages and which should remain redirects.
- The original PDFs and images if any are absent from `public/`.
