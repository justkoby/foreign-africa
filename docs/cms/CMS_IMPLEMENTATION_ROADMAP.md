# Foreign Africa CMS: Implementation Roadmap (revised)

Base: `staging` + this branch. Architecture retained: Express 4, MySQL, Tiptap, React/Vite, Node 22, Hostinger. All work stays on `claude/fervent-heisenberg-b5k9dm`; no deploy, no merge to `main`.

## Done this session
- Checkpoint tag `checkpoint/staging-55d057a`; staging merged cleanly.
- Discovery rate-limit fix (`req.ip`, spoof-resistant) + regression test.
- Inter for `/admin` and `/editor` only; public Mark Pro untouched and browser-verified.
- This documentation set corrected.

## Step 1 status (2026-11-01): implemented, verified on MariaDB 11.8.9 and MySQL 8.0.46, not deployed
- `/api/cms` and `/editor` consolidated into the Studio: Studio session + `legacy.edit` role; shared password and file submissions retired on the Express server (410).
- Legacy file collections embedded under `/admin#/legacy/...`; writes disabled in staging/production unless `LEGACY_FILE_EDITING=1` (they are build-time files and would be lost on redeploy).
- Submissions moved to MySQL (migration `005`): server-side validation, dedupe, rate limit, statuses, assignment (administrators only), notes, CSV export with formula defusing, audit log without personal data, idempotent import of any old `submissions.json`.
- Scheduled publishing works without a worker (query-time visibility + throttled promotion); cron optional.
- `server/backup.js` now includes forms/submissions/notes (previously omitted) and accepts file-serialized dumps.
- Studio navigation grouped, breadcrumbs, responsive fixes, admin-only heading typography.
- Remaining for the legacy collections: migrate events, people, engage pages and form definitions themselves into MySQL with runtime public APIs (Steps 5–7). Until then they are a build-time workflow.

## Open items I need from you
1. **Antigravity changes**: not on the remote. Push the branch or tell me where it is before I touch overlapping areas (editor, media, admin shell).
2. **Run `npm test` somewhere with internet** (or provide MySQL 8) so the 3 MySQL suites run. I will not claim database behaviour as verified until then.
3. **Hostinger facts** (cannot be checked from here): Node 22 app available on your plan; ability to run a scheduled job (cron) or an external caller for `POST /api/staff/schedule/run`; a persistent `MEDIA_ROOT`.
4. Approve **retiring `/editor`** once its modules (events, people, forms, submissions) exist in the Studio. Until then it stays, but see step 1 below.

## Sequence (each step small, tested, independently reviewable)

**Step 1: Contain the legacy editor (P0, ~2 days).** Gate `/api/cms` and `/editor` behind Studio sessions + role checks (replace the shared password), and move submissions out of the deploy tree into MySQL `submissions` immediately, even before the form builder UI exists. Add a data-loss warning to deploy docs. No behaviour loss.

**Step 2: Admin shell & design tokens (~1 week).** One shared CSS token file and component set (button, field, table, badge, notice, modal); collapsible sidebar, top toolbar with quick-add and account menu, breadcrumbs, WordPress-style grouping from `CMS_DESIGN_SYSTEM.md`; keep existing hash routes. Role-filtered nav from a single module registry so unbuilt modules disappear for roles that can't use them.

**Step 3: Permissions model (~3 days).** Add `reviewer`; rename display of `contributor` to Author; replace the coarse grant list with per-module permissions (`homepage.edit`, `settings.manage`, `forms.review`, `ai.use`, …). Migration `005`. Role-matrix HTTP tests for every route (403 grid).

**Step 4: Editor completion (~1.5 weeks).** Tables extension, approved video embed (YouTube/Vimeo allow-list reusing `youtubeEmbedUrl`), category/tag management, in-app unsaved-changes guard, bulk actions, duplicate/archive from list, media replace, drag-drop, grid/list, usage panel.

**Step 5: Hero + homepage editor (~2–3 weeks).** Migration for `hero_slides` (draft/published copies) and schema-validated `homepage_slots` payloads, backend validators reusing `hero-content.js` rules (CTA host/path allow-list, duration 8–20 s, mobile fallback), API, Studio UI with desktop/mobile preview using the real `Hero` component. First extract homepage copy from `main.jsx` into data with **screenshot-identical output** before any editing UI. Editors edit values only.

**Step 6: Modules (~3 weeks).** Team, partners, events (registration expiry), opportunities, policy briefs (upload PDF; page-image generation via `sharp`/pdf tooling or a developer-run step, since Hostinger likely has no PyMuPDF), menus, redirects, settings. Public pages switch from static modules to `/api/public`, with static data kept as fallback until parity is proven. Smart Discovery catalogue reads published content.

**Step 7: Forms & submissions (~2 weeks).** Builder on `form-definition.schema.json`, private submissions, statuses, assignment, notes, audited CSV export, retention; applicant files in non-public storage.

**Step 8: Gemini in the editor (~2 weeks).** `server/ai/` with env-only key, `ai.use` permission, per-user daily quota and usage table (tokens, est. cost), admin-selectable model, selection toolbar (improve, rewrite, summarise, expand, simplify, headline) returning suggestions to insert/replace/copy/discard, tone presets, grounding on an approved knowledge table (organisation profile, terminology, published articles) with "state gaps, never invent" instructions, personal-data screening, no prompt logging, AI-label on revisions, never auto-publish.

**Step 9: QA & staging (~1–2 weeks).** Playwright editorial flows, role grid, upload tests, AI mocked-failure tests, mobile admin, public regression screenshots, backup/restore drill, deployment recommendation for `preview.foreignafrica.org`.

## Safeguards
Forward-only idempotent migrations (existing pattern); each step lands as its own commits with tests; public visuals protected by screenshot comparison; developer-only: component structure, CSS, routing, migrations and deployment stay out of every CMS role.
