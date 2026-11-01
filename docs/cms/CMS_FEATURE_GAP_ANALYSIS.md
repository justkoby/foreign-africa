# Foreign Africa CMS: Feature Gap Analysis (against commit `55d057a` + current branch)

**FF** fully functional · **FI** functional, needs improvement · **PI** partial · **UI** placeholder only · **MI** missing · **BR** broken/unreliable. "Code-verified" = read in source; "MySQL-unverified" = depends on suites I could not run here.

| Area | Status | Evidence / gap |
|---|---|---|
| Auth, sessions, lockout | FI (MySQL-unverified) | bcrypt, hashed tokens, DB login throttling, origin check. No MFA, no password reset flow, no session list/revoke UI |
| Roles & permissions | PI | 4 roles, enforced in `requireUser` on every `/api/staff` route (code-verified). Missing: Reviewer, per-module grants, submission assignment. Legacy `/api/cms` ignores roles entirely |
| Admin shell / nav | FI | Sidebar + hash routes + mobile toggle. Not collapsible, no breadcrumbs/top toolbar, no quick-add, unbuilt modules shown as "Not in this release" |
| Typography/design system | PI → improved | Inter applied this session; no tokens file, components still ad hoc in two CSS files with long lines. `/admin` and `/editor` are visually different apps |
| Dashboard | FI | Real counts from DB; lacks scheduled list, needs-attention links, submissions |
| Content list | FI | Search, status filter, sort, pagination. No bulk actions, no type/author/date filters |
| Rich-text editor | FI | Tiptap with allow-listed output. Missing tables, video embeds, categories/tags UI, in-app unsaved guard |
| Draft/review/publish/schedule | FI | Full status set and permission gating. Scheduling depends on cron/endpoint call (Hostinger unverified) |
| Revisions | FI | List, compare, restore |
| Autosave | FI | Drafts only |
| Preview | FI | Authenticated preview endpoint; not device-width preview |
| Media library | FI | Upload, sharp, alt text, safe delete vs content refs. Missing replace, grid/list, drag-drop, usage panel (hero/team/partner refs), captions field, private storage |
| Users & roles UI | FI | Plain list; no invite/reset |
| Activity log, health, settings | FI / PI | Read-only settings; no editable site settings |
| SEO | FI | Per-item SEO fields, canonical, JSON-LD, sitemap, robots. No redirects UI |
| Hero management | MI | Data model + tests are ready (`hero-content.js`); no DB table, API, editor, preview |
| Homepage sections | MI | Copy in JSX; `homepage_slots` table unused |
| Team & leadership | PI | Legacy file editor (`people`); `team_members` table unused |
| Partners | MI | Static `partners.js`; `partners` table unused |
| Policy briefs | MI (render FF) | Reader works; `publications` table unused; PDF→page-images is a Python script |
| Events | PI | Legacy file editor only; `events` table unused; no past-event registration expiry logic in CMS |
| Opportunities | MI | Static pathways; `opportunities` table unused |
| Forms builder | PI | Legacy file editor + JSON schema; `forms/form_fields/submissions` tables unused; submissions in a file |
| Submissions / reviewers | PI | Legacy file list only; no statuses, assignment, notes, export |
| Navigation menus | MI | Static `menu-content.js`; `navigation_items` table unused |
| Redirects | MI | `redirects` table unused; legacy WordPress URLs served as slugs |
| Gemini editorial assistant | MI | None in CMS |
| AI governance (quota/usage/model setting) | MI | Only an in-memory limiter on public Discovery |
| Public sync | PI | News/commentary/page via `/api/public/content`; everything else static; Discovery catalogue static |
| Tests | FI | 66 tests; no browser, role-matrix HTTP, upload, or AI-failure tests; MySQL suites need internet |
| Backup / recovery | PI | `server/backup.js` + `BACKUP_RECOVERY.md`; no restore drill |
| Hostinger deployment | PI | Fully documented, never executed |

## Reuse, don't rebuild
Studio shell, `store.js`/`content-store.js`, permissions, document sanitiser, media pipeline, revisions, activity log, migrations/prepare flow, staging lock, `hero-content.js` rules, Discovery's Gemini hygiene, `cms/form-definition.schema.json`, existing unused tables in `003_listings.sql` (extend, don't replace).
