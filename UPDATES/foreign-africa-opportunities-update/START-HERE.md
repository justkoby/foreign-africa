# Foreign Africa — Opportunities redesign

This package contains the new opportunities hub, four overview pages, and refreshed homepage cards. The complete overlay also includes the earlier partners, policy briefs and commentaries updates so shared files remain consistent. It is based on main commit 8f89359d5012820d65307cdb12c380d5864dfcd5. Nothing has been pushed or deployed.

## Apply with Cursor
Open the current justkoby/foreign-africa repository and preserve all unrelated edits.

Choose ONE approach:
- If you have applied the previous commentaries update ZIP (including its partners/policy changes), use `opportunities-only.patch`. Check it first with `git apply --check opportunities-only.patch`, then apply it if the check passes.
- If none of these updates are applied, use `integration.patch`. Check it first with `git apply --check integration.patch`, then apply it if the check passes.
- Alternatively, merge the `files/` overlay into matching repository paths. It is cumulative. Copy new files and compare existing shared files carefully against your current version.

Do not apply both patches, or apply the overlay after applying a patch. If a patch check fails, use the overlay as a reference and merge deliberately. FILE-MANIFEST.json identifies this turn’s opportunitiesFiles and all packaged paths/hashes.

## New pages and presentation
- /opportunities/: pathway hub, current-information note, FAQs and useful links.
- /fellowships/: leadership and research overview.
- /calls-for-papers/: research contribution overview and themes.
- /volunteer-opportunities/: skills and service overview.
- /foreign-africa-enterprise-week-few-2/: Enterprise Week overview; the version without -2 is also supported.
- Homepage: four illustrated pathway cards with links to the hub and separate internship information.
- Header, footer, programme navigation and Smart Discovery connect to the local pages.

Each overview includes a status panel, source-based introduction, thematic focus cards, general announcement checklist and related pathways. The published pages have no specific application call, submission brief, volunteer role or event edition details. No open/closed status, deadlines, eligibility, funding or event dates have been invented. Email links open editable drafts; there is no automatic sending, application form or fake subscription confirmation.

The Remote Internship Programme keeps its separate original programme page. No backend, database, live CMS, subscription service or dependency changes are included.

## Validation
Run npm ci, npm test, npm run build, then npm run dev. Check /, /opportunities/ and all four overview routes. All 37 Node tests, the production build and whitespace checks passed. Browser review covered the hub, FAQ disclosure, homepage cards, Enterprise Week, 390px mobile hub, 320px detail pages and email enquiry destinations (without sending messages).

See docs/opportunities-update.md for source URLs, data model, availability handling and future publishing notes. This ZIP includes source and assets, not generated dist/ or development-only preview files.
