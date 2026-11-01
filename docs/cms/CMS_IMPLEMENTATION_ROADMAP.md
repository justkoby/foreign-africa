# Foreign Africa CMS: Implementation Roadmap

Status: **proposal, pending the decisions below.** No application code has been changed.

## Decisions needed before Stage B

1. **Where is the existing CMS?** If a Cursor/Antigravity copy exists elsewhere, provide the repo/branch/zip so it can be audited and reused. If not, we build from zero.
2. **Backend platform.** Recommended default: **Node/Express + MySQL on Hostinger Business**, as the brief states. Reasons: it matches the named host and database; Supabase exists only as an unapplied proposal; Postgres/RLS offers no value we have already built. Alternative: Supabase + Vercel as in `docs/cms-handoff.md`. Costs: a second vendor, and it conflicts with the Hostinger target. Confirm the Hostinger plan supports a Node.js app, MySQL, outbound HTTPS to `generativelanguage.googleapis.com`, and persistent upload storage.
3. **Public site delivery.** Recommended: keep the Vite SPA static; the CMS publishes validated JSON snapshots (plus a small read-only content API for dynamic needs), so a database outage never takes the public site down.
4. **Branch/checkpoint:** work continues on `claude/fervent-heisenberg-b5k9dm`; nothing goes to `main` without approval.

## Quick wins (safe, small, no platform dependency)

| # | Change | Why |
|---|---|---|
| Q1 | Remove or relocate `UPDATES/` (36 MB) and root `WhatsApp-Image-*.webp` after verifying `main` supersedes them | Ends "which is latest?" confusion |
| Q2 | Reformat `main.jsx` and content modules with a formatter (no logic change) | Reviewable diffs before extraction |
| Q3 | Convert TTF-only Mark Pro weights to subset WOFF2 | Page weight; do not alter font stack |
| Q4 | Trusted-proxy aware rate-limit key for `/api/discover` | Correct on Hostinger |
| Q5 | Add Hostinger deployment + backup notes to README | Docs match target |
| Q6 | Give stories real slugs (`/news/<slug>/`) while keeping `?story=` working | Prerequisite for SEO preservation |

## Stages

**Stage B: Architecture & contracts (≈1 week).** Final content model (shared `content` core + per-type validated payload schemas), role/permission matrix, API contract, design tokens, homepage section schemas (see below), migration/seed strategy, backup plan. Output: updated docs + ADRs. Exit: you approve platform + model.

**Stage C: Backend foundation + admin shell (≈2–3 weeks).** Express app, MySQL migrations, sessions (HTTP-only cookies, CSRF, argon2/bcrypt, lockout), role middleware on every route, audit log. React admin at `/admin` (separate Vite entry so the public bundle is unaffected): shell, sidebar, tables, forms, notices, Inter typography. Exit: login + role-gated empty modules + tests.

**Stage D1: Posts/News editor + media (≈3 weeks).** Tiptap with a restricted extension set, server-side sanitisation (allowlist), autosave, revisions, scheduling, preview, slugs, categories/tags, bulk actions. Media library: upload validation, sharp-based optimisation, originals kept, usage references, referenced-asset delete block, private bucket for applicant documents.

**Stage D2: Homepage + Foreign Africa modules (≈3–4 weeks).** First extract homepage copy from JSX into data **with pixel-identical rendering** (visual regression screenshots). Then: hero manager (reuse `hero-content.js` rules), homepage sections, team, partners, policy briefs (PDF upload + page-image generation, Node or developer-run step), events, opportunities, recordings, menus, SEO/redirects. Public site reads snapshots; draft/scheduled rules tested.

**Stage D3: Forms & submissions (≈2 weeks).** Form builder, private submissions, statuses, reviewer assignment, notes, audited exports, retention rules.

**Stage E: Gemini editorial assistant (≈2 weeks).** Server-only key, authenticated role-gated endpoints, per-user quotas, usage/cost table, admin model selection, in-editor selection actions producing suggestions (insert / replace / copy / discard, never auto-apply), grounding on an approved knowledge set with "identify gaps, don't invent" instructions, redaction rules that block applicant/personal data, AI-generated labelling and no auto-publish.

**Stage F: Testing & staging (≈1–2 weeks).** See test plan below. Deployment recommendation to preview subdomain only. Production deploy and merge to `main` require your explicit approval.

Total estimate: roughly 3 months for one engineer. Stages C and D1 yield a usable article CMS first (≈6 weeks).

## Homepage editing contract (draft for Stage B)

Editors edit **values**, never structure. Each section has a JSON schema enforced server-side:

- `hero.slides[]`: `id`, `enabled`, `title` ≤90, `description` ≤220, `desktopMedia` (media ref, image/video), `mobileMedia?` (falls back to desktop), `cta{label ≤30, href}`, `duration` 8–20 s, `order`. `href` must be a relative path or allow-listed host; video must be an uploaded MP4/WebM or allow-listed YouTube. Existing `kind`/`photoLayout`/`position` stay developer-controlled.
- `about`: heading, body (≤1,200 chars), image ref, CTA.
- `featured*`/`latest*`: references to published content IDs, optional heading, count within bounds.
- `partners`, `team highlights`, `events`, `opportunities`, `recordings`, `cta`: references plus bounded copy.
- Defaults supplied when a field is empty. Unknown keys rejected.

## Roles (Phase 7 mapping)

| Capability | Super Admin | Admin | Editor | Author | Reviewer |
|---|:-:|:-:|:-:|:-:|:-:|
| Users/roles, integrations, AI model/limits | ✔ | users only | | | |
| Settings, menus, SEO/redirects | ✔ | ✔ | | | |
| Publish content, edit homepage sections | ✔ | ✔ | ✔ | | |
| Create/edit own drafts, submit for review | ✔ | ✔ | ✔ | ✔ | |
| Media | ✔ | ✔ | ✔ | upload only | |
| AI assistant | ✔ | ✔ | ✔ | limited quota | |
| Assigned submissions/applications | ✔ | ✔ | | | ✔ |
| Code, migrations, deployment | **outside the CMS** | | | | |

## Test plan (Stage F)

Automated: unit tests for schemas/sanitiser; API tests per role per endpoint (403 matrix); migration up/down on a scratch DB; publish/schedule/unpublish state tests; Gemini mocked success/timeout/quota/malformed; upload type/size/polyglot rejection; submission privacy (no public route reads them). Browser (Playwright, already present in the environment): login, article create→autosave→revision restore→publish→appears on public page, homepage edit→preview→publish, mobile admin viewport, public-site regression screenshots. Ops: backup + restore drill on staging.

## Risks

- Hostinger shared-hosting limits (process lifetime, memory, no root). Verify early with a spike.
- Extracting homepage JSX can regress the public design; mitigate with screenshot diffs before and after.
- Gemini data handling: use a paid-tier key and block personal/applicant data from prompts.
- Mark Pro licensing is the owner's to confirm; the admin must not use it.
