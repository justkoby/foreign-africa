# Foreign Africa — Partners & Policy Briefs Update

Prepared against main commit 8f89359d5012820d65307cdb12c380d5864dfcd5.
Local implementation commit: 7381876.

The GitHub push was blocked by automatic approval review. This package contains the completed local changes; it has not been pushed or deployed.

## Apply with Cursor
Open the current justkoby/foreign-africa checkout. Review the files in this package against your current branch. The `files/` directory mirrors repository paths. Copy new files to their matching paths; merge existing files carefully if they have changed since the baseline above. Do not replace the entire repository. An equivalent Git binary patch is included as `integration.patch`; use either the overlay OR the patch, not both. `git apply --check integration.patch` can verify patch applicability before applying it. Preserve all unrelated work.

## Included work
- /partners/: six individual partner cards with supplied and existing marks.
- Homepage: continuously scrolling partner strip with pause, hover/focus pause and reduced-motion support.
- /policy-briefs/: real covers, issue/date/page metadata, summaries, takeaways, reader and PDF downloads for both supplied briefs.
- Reader: page navigation, zoom, expanded view, keyboard handling and selectable text view for phones.
- Local navigation and Smart Discovery indexing for both pages and the individual briefs.
- Original PDFs and all derived reading assets, plus a script to regenerate them.

## Validate
Run `npm ci`, `npm test`, `npm run build`, then `npm run dev`. Visit /, /partners/ and /policy-briefs/. All 29 tests and the production build passed. Desktop and 390px iframe layouts were visually checked; reader navigation, text view, expansion and logo pause were exercised in the browser. GFZA/IPPA logos retain the lower resolution of the original supplied strip. Text mode is extracted text; use Original for tables and charts.

No dependency or database changes. No deployment is included. Future publishing should preserve SPA deep-link routing.
