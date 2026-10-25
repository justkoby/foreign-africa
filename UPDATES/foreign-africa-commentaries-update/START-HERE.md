# Foreign Africa — Commentaries redesign

This package contains the completed /blog/ redesign plus the earlier partners and policy-brief changes. It is based on main commit 8f89359d5012820d65307cdb12c380d5864dfcd5. No changes in this package have been pushed or deployed.

## Apply with Cursor
Open the current justkoby/foreign-africa repository. Preserve all unrelated work.

Choose ONE integration method:
1. If the previous partners/policy update is already applied, use `commentaries-only.patch` after checking it with `git apply --check`. This patch is based on the completed partners/policy implementation (7381876).
2. If neither update is applied, use `integration.patch` after checking it with `git apply --check`. This is the combined partners, policy briefs and commentaries update against the baseline main commit above.
3. Alternatively, merge the `files/` overlay into matching repository paths. It includes both updates. Copy new files; compare shared files carefully rather than blindly replacing newer changes.

Do not apply both patches or apply the overlay after applying a patch. If a patch check fails, compare the overlay against your current files and merge deliberately. FILE-MANIFEST.json lists exact paths and hashes; commentariesFiles identifies this turn’s changed paths.

## Commentaries page
- Compact Commentaries heading and a featured latest article.
- All twelve published Blog-category commentaries, including older items beyond the original page’s first ten cards.
- Search by keyword, place or author; topic and year filters; oldest/newest ordering.
- Six additional cards initially, More commentaries, accurate result counts, reset and empty states.
- Source-based summaries, actual bylines, dates and approximate reading times.
- Twelve optimized local featured photographs, lazy-loaded for archive cards.
- Navigation and Smart Discovery integration; aliases /commentaries/ and /category/blog/.
- Responsive layouts reviewed at desktop, 390px and 320px; keyboard focus is retained when more cards load.

Article bodies remain at their original foreignafrica.org destinations. This update changes the listing; it does not create local article-detail pages or a live CMS connection. Preserve or migrate the existing WordPress article routes before a full domain cutover. More details are in docs/commentaries-update.md.

## Validate
Run npm ci, npm test, npm run build, and npm run dev. Visit /blog/, /partners/ and /policy-briefs/. The completed implementation passed all 33 Node tests, the production build and whitespace checks. Browser interactions verified search/topic filtering, empty-state reset, loading remaining articles, year filtering, date sorting and focus after progressive loading.

No package dependencies, database migrations, credentials, generated build files or development-only preview files are included.
