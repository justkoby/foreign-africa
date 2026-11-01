# Foreign Africa CMS: Audit Report (Stage A)

Audited: 2026-11-01. Branch `claude/fervent-heisenberg-b5k9dm`, commit `f1b7841` (identical to `origin/main`). Working tree clean at start.

## 1. Headline finding: there is no CMS in this repository

The brief describes an existing React/Express/MySQL/Tiptap CMS with `/admin` and `/editor` routes, worked on with Cursor and Antigravity. **None of that exists in this repo.**

| Brief assumed | What is actually here |
|---|---|
| Express API | No Express. One serverless-style handler, `api/discover.js` (Smart Discovery), plus a Vite dev middleware that mounts it |
| MySQL | No MySQL. A *proposed, never-applied* Supabase/Postgres migration (`supabase/migrations/202610250001_content.sql`) |
| Tiptap editor | Not a dependency. `package.json` has only `react`, `react-dom`, `lucide-react`, `vite` |
| `/admin`, `/editor` | No such routes. `resolvePage()` in `src/pages/routes.js` knows only public pages |
| Users/roles/auth/sessions | None. A `content_editors` table exists only in the unapplied SQL |
| Media library, forms, submissions, revisions | None |
| Antigravity / other branches | Only `main` and the current branch exist, both at `f1b7841`. Two commits total. No other branch, stash or uncommitted work |
| Hostinger deployment | No Hostinger config. `vercel.json` and the README target Vercel |

The repo's own docs agree: `README.md` says "The CMS, authentication, subscriptions … are not implemented yet" and `docs/cms-handoff.md` says "No database has been provisioned … no editor dashboard".

**Most likely explanation:** the CMS work lives in a different repository, working directory or machine (the Cursor/Antigravity copy). This needs your answer before Stage B (see "Decisions needed").

## 2. What the repo is

A polished public marketing site: React 19 + Vite 7, no router library (custom `resolvePage()` + query-string `?story=` routes), Lucide icons, Mark Pro fonts (self-hosted, `src/fonts.css`). 383 tracked files. Baseline health:

- `npm test`: 37/37 pass. `npm run build`: succeeds (JS 381 kB / 114 kB gzip, CSS 99 kB).
- Tests cover content integrity (asset files exist, past events not shown as open), search, hero model and Discovery endpoint behaviour with mocked Gemini. No UI or browser tests.

## 3. Content is hard-coded in source modules

This is the real CMS surface. Each static module below is a candidate content type, and a "contract" a CMS must reproduce.

| Content | Source | Records | Notes |
|---|---|---|---|
| Hero slides | `src/hero-content.js` | 5 | Already CMS-shaped: `published`, `order`, `desktopMedia`, optional `mobileMedia` (falls back to desktop), `cta`, `duration`, `featuredMedia`. Has `youtubeEmbedUrl()` host allowlist and `mediaForViewport()`. Best reuse candidate |
| Activity/news stories | `src/activities.js`, served at `/?story=<id>` | 7 | Query-string routes, not real slugs. Content is block-ish but ad hoc |
| Commentaries | `src/pages/commentaries-content.js` | 12 records | Listing only; bodies stay on WordPress |
| Team & leadership | `src/pages/team-content.js`, `src/people.js` | 10 + 10 interns | Group routes + `/people/<id>/` |
| Partners | `src/partners.js` | 6 | No links by design (no invented relationships) |
| Policy briefs | `src/pages/policy-content.js` + `public/documents/policy-briefs/<slug>/` | 2 | PDF + cover + per-page WebP + `text.json`, generated offline by `scripts/render-policy-briefs.py` (PyMuPDF) |
| Opportunities | `src/pages/opportunities-content.js` | 4 pathways | Status text is deliberately non-committal |
| About | `src/pages/about-content.js` | 1 | |
| Menus | `src/menu-content.js`, `src/content.js` | | Hard-coded mega menu |
| Homepage sections | Inline JSX in `src/main.jsx` (~13 kB, long lines) | ~10 sections | Copy is embedded in JSX, not data. Biggest refactor cost |
| Smart Discovery catalogue | `src/discovery.js` + `src/pages/page-directory.js` | | Built from the modules above at import time; new CMS content will not appear unless this is made data-driven |

Export script `scripts/export-content.mjs` already produces `supabase/content-seed.json` (draft import data). Reuse it as the basis of the first import, not as a finished data model: it covers only `about`, `person`, `news`, `hero` and omits partners, policy briefs, opportunities, commentaries, menus and homepage sections.

## 4. Existing assets worth reusing

1. **Hero data model + tests** (`hero-content.js`, `tests/hero.test.js`): validated shape, fallback rule, past-event guard.
2. **Smart Discovery server pattern** (`server/discovery-service.js`, `api/discover.js`): good Gemini hygiene to copy for the editorial assistant. Key via env var only, `x-goog-api-key` header, 10 s timeout, structured JSON schema, token cap, source-ID validation, markup/URL rejection in output, no logging of questions. It is public-facing and directory-only, so it is **not** the editorial assistant. It does not do auth, roles, usage accounting or grounding on full documents.
3. **Document reader** (`DocumentReader.jsx`, lazy-loaded): working; must be preserved.
4. **Provenance discipline**: `docs/content-sources.md` records evidence limits (e.g. 474 registrations ≠ attendance). The CMS needs a provenance/source field and an editorial rule set to keep this.
5. **Supabase RLS draft**: sound ideas (drafts never public, `published_at <= now()` gating, editor membership assigned server-side, slug regex), but see risks.

## 5. Technical debt and risks

**Repository hygiene**
- `UPDATES/` is **36 MB** of superseded patch bundles and file copies (`integration.patch`, `files/`, a full `first-pass` copy). Largest source of confusion about "latest". Delete or move out after confirming `main` already contains them (a `diff` shows `files/src` is a subset/older of `src`).
- Four `WhatsApp-Image-*.webp` files at the repo root duplicate `public/images/activities/*` (same byte sizes).
- 27 `.ttf` files tracked; some weights ship only as TTF (100–350 kB each) and are bundled into `dist`. Convert missing weights to WOFF2 and subset. Confirm the Mark Pro licence covers web embedding.
- `main.jsx` and several content files are minified-style long lines, which hurts diffs, review and CMS refactoring.
- Duplicate sources of truth: `src/people.js` vs `team-content.js`; route knowledge split between `routes.js`, `page-directory.js` and `menu-content.js`.

**Security / reliability (existing code)**
- `api/discover.js` rate-limit key is `x-vercel-forwarded-for` falling back to `socket.remoteAddress`. Off Vercel (e.g. Hostinger behind a proxy) the header is absent and the fallback is the proxy's IP, so **all visitors would share one 10/min bucket**. If a trusted-proxy header is added naively it becomes spoofable. Needs a configured trusted-proxy rule.
- Limiter is per-instance memory, so it is not a cost cap. The README already says this.
- Origin check only runs when an `Origin` header is present (curl bypasses it). Acceptable for a public endpoint, wrong for admin endpoints.
- `vite.config.js` hard-codes `allowedHosts: ['terminal.local']`.

**Draft Supabase schema gaps**
- Single `content_items` table with free-form `jsonb` payload: no per-kind validation, no revisions, no media/forms/submissions tables.
- Role model is a boolean (`content_editors`): any editor can update/delete anything, publish, and edit everything. No author/reviewer/admin split, so it cannot meet Phase 7.
- Kinds limited to 5; no partner, policy brief, event, opportunity, form, menu, redirect or settings kinds.
- Only `news` carries "original source/provenance" by convention, not by constraint.

**Platform mismatch**
- The stated target (Hostinger Business) and the committed config (Vercel + proposed Supabase/Postgres) conflict. `docs/cms-handoff.md` explicitly recommends Next.js + Supabase, which contradicts the brief's "preserve React/Express/MySQL". Hostinger Business can host Node.js apps and MySQL, but this must be confirmed on the actual plan (Node version, memory, cron, outbound HTTPS to Google, persistent disk for uploads).

## 6. Documentation accuracy

README and `docs/*.md` are **accurate and unusually honest** about the CMS not existing. They are inaccurate only relative to the brief. README's deployment section describes Vercel, not Hostinger, and has no backup/recovery section.

## 7. Prioritized critical findings

1. **P0: the CMS code isn't here.** Locate the Cursor/Antigravity work, or confirm we are building from zero.
2. **P0: platform decision** (Express+MySQL on Hostinger vs Supabase+Vercel) blocks all backend work.
3. **P1: homepage copy is embedded in JSX**, so a homepage editor needs a section-by-section extraction into data with unchanged rendering.
4. **P1: no real slugs** for stories (`?story=`), which blocks SEO preservation and "slugs/links preserved".
5. **P1: Smart Discovery is build-time**, so it won't index CMS content until fed from the content API.
6. **P1: policy-brief processing** depends on Python/PyMuPDF, which is unlikely on shared hosting. Needs a Node alternative or a developer-run step.
7. **P2: `UPDATES/` bloat, root duplicates, TTF-only fonts.**
8. **P2: rate-limit keying** behind a non-Vercel proxy.
