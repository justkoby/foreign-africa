# Cursor: merge this update into the current Foreign Africa project

Use the current project as the source of truth. This is the revised cumulative About / team / mega-menu update against the original baseline. It supersedes the previous About/team package; if that is already merged, integrate only the remaining differences. Do not replace the whole project.

1. Inspect the current working tree. Preserve all newer changes, particularly Mark Pro/font assets, the Gemini endpoint/configuration, the assistant launcher, environment files, mobile hero fixes and deployment settings. Keep React + Vite. Never print or commit secrets.
2. Read `new-files/docs/about-team-update.md` in this extracted update. Inspect `FILE-MANIFEST.json` and `integration.patch` to understand exactly what changed.
3. Add the modules/assets/tests under `new-files/` at their corresponding project-relative paths. If any destination already exists, compare and merge it instead of overwriting it.
4. Merge the existing-file examples under `merge-reference/`. Treat `src/main.jsx` as an integration example, not a replacement: integrate SiteHeader/Brand, local About/team/profile routing, page titles and local About links while preserving the current assistant and search state. If routing already exists, integrate into that router. Keep whichever correct Back to top fix is already present.
5. Merge `src/discovery.js` directory additions, categories and accent-normalised search without removing current Gemini improvements. Preserve server-side-only API keys. Keep the new About and people pages discoverable.
6. Keep the full supplied biographies in `src/pages/team-content.js` and original portraits unchanged. There are now ten supplied full profiles: three Advisory Council, five Executive Leadership and two Secretariat. Three other Secretariat members have names/roles only; do not invent their bios, photos or contact details. Preserve the new Secretariat group as separate from Executive Leadership. Reuse the existing intern cohort as Junior Associates.
7. Keep shared branding, homepage hero/carousel, optional mobile posters, floating assistant and current fonts. Reuse the existing search dialog rather than introducing another assistant. Ensure the new header button opens it and returns focus properly.
8. Preserve hosting configuration. Verify direct requests and refreshes for /who-we-are/, /our-mission-vision/, /advisory-council/, /executive-leadership/, /secretariat/, /junior-associates/ and /people/<id>/ serve the app; API requests and assets must retain their correct routes.
9. Run npm test and npm run build. Check desktop/mobile, all four people groups, ten biographies, menu toggling, Escape/focus return, outside click, mobile menu scroll, search, Back to top, homepage links and reduced-motion behaviour. Fix regressions.
10. Summarise the merged changes and remaining content/backend work. Do not deploy or execute Supabase migrations. The draft seed is preparation only, not a working CMS.

Do not force-apply the patch if it conflicts. It is a precise reference against baseline bbcd16a; merge into the current implementation deliberately.
