# Foreign Africa CMS audit and architecture

**Date:** 25 October 2026  
**Status:** Proposal only. No backend or CMS implementation follows this document until it is approved.  
**Scope:** The repository at the time of the audit, including the public React site and the local file-backed editor at `/admin`.

This audit does not change production DNS, the live WordPress database, or hosting settings.

## 1. Existing architecture

Foreign Africa in this repository is a React 19 and Vite 7 single-page application. Routing is pathname matching in `src/pages/routes.js`, not React Router. The public site is rendered from `src/main.jsx`. `/admin` loads a separate editor bundle.

There is no MySQL database and no Express server in the repository. Two server handlers exist and run only inside the Vite dev server (`vite.config.js`):

- `api/discover.js` — Gemini discovery. The key stays server-side.
- `api/cms.js` and `server/cms-service.js` — a file-backed editor.

That editor stores catalogues in `data/cms/*.json`, commentary bodies in `public/content/commentaries/{id}.json`, and submissions in gitignored `data/cms/submissions.json`. Sign-in is one shared password (`CMS_PASSWORD`), stored as an HttpOnly HMAC cookie. It is a local drafting tool. It is not the production CMS described below.

`vercel.json` rewrites non-API paths to `index.html`. The intended host for the new system is Hostinger Business Web Hosting, not Vercel. A Supabase SQL file exists under `supabase/` and is unused. Do not apply it. Do not add Supabase or Firebase.

Production domain today is still the WordPress site at `https://foreignafrica.org`. This React app is the replacement frontend. It is not yet the live origin.

### What must stay

Preserve the public redesign: video and image hero, sticky header, Mark Pro and DM Sans, Lucide icons, partner strip, people scroller, discovery assistant, Back to top, and the hash-scroll behaviour in `src/main.jsx`. Replace hardcoded copy with API data only where an editor needs to change it. Do not restyle finished pages as part of the CMS work.

## 2. Content inventory

Counts are published records in the current catalogues unless noted.

| Section | Where it lives now | Records | Editor can change it |
| --- | --- | --- | --- |
| Homepage hero | `src/hero-content.js` | 2 slides | No |
| Homepage focus, research, programmes, footer | `src/main.jsx`, `src/content.js` | Fixed sections | No |
| Activity stories | `src/activities.js` | 7 stories | No |
| About | About content module, rendered by `InnerPages.jsx` | 1 page | No |
| Team profiles | `data/cms/people.json` | 10 profiles, 3 name-only secretariat rows | Yes, file editor |
| Partners | `src/partners.js` | 6 organisations, logos only | No |
| News cards | `data/cms/news.json` | 5 | Yes, but 3 cards still open WordPress |
| Events | `data/cms/events.json` | 3 announcements, no registration | Yes |
| Commentaries | Catalogue JSON plus 12 article JSON files | 12 full local articles | Yes |
| Opportunities | `src/pages/opportunities-content.js` | 5 pathways, all enquiry overviews | No |
| Policy briefs | `src/pages/policy-content.js` and `public/documents/policy-briefs/` | 2 PDFs with page images | No |
| Engage services | `data/cms/engage.json` | 3 services, 5 contact topics, 1 expired vacancy | Yes |
| Forms | `data/cms/forms.json` | 10 definitions, all `draft` | Yes |
| Navigation | `src/menu-content.js`, `src/content.js` | Hardcoded | No |
| Contact | Mailto composer. Hosted form appears only if `general_enquiry` is published | Not published | Partial |
| Discovery index | `src/pages/page-directory.js` | Built from the modules above | Indirect |

There is no separate blog. `/blog/` and `/commentaries/` both open the commentary archive.

Programme pages that do not exist in this app, and still point at WordPress:

- Africa Trade & Job Tracker
- Enterprise Development Workshop Series
- Skillshare@ForeignAfrica
- Municipal Diplomacy Programme
- Research hub (`/research/`)
- Programmes hub (`/programmes/`)

Opportunity pages are honest overviews. They do not list a current call, deadline, or application form. Events do not offer registration. Policy briefs are real local PDFs.

## 3. Content-to-entity mapping

Use one article table for news, commentaries, and static pages. Separate tables only where the fields are actually different.

| Website section | Entity | Notes |
| --- | --- | --- |
| News, commentaries, about, programme pages | `content_items` (`type`) | Shared title, slug, summary, body, author, dates, status, SEO |
| Categories and topics | `terms`, `content_terms` | One vocabulary table, typed |
| Article history | `content_revisions` | Snapshot on each save |
| Events | `events` | Start, end, venue, registration mode |
| Opportunities | `opportunities` | Application mode is a field, not a separate product |
| Forms | `forms`, `form_fields` | Built by staff, not hardcoded |
| Applications, enquiries, registrations | `submissions`, `submission_files` | One inbox, filtered by form |
| Team | `team_members` | Group, order, active or archived |
| Partners | `partners` | Logo, link, order, active or archived |
| Publications | `publications` | Cover, PDF, year, category |
| Media | `media_assets` | Files live outside the deploy folder |
| Menus | `navigation_items` | Header, footer |
| Homepage slots | `homepage_slots` | Points at existing records. Editors do not edit layout code |
| Settings | `settings` | Key and value |
| Old WordPress URLs | `redirects` | 301 only after the new page exists |
| Staff | `users`, `roles`, `user_roles`, `sessions` | See security |
| Editorial and system actions | `activity_logs` | No secrets in the message |

Do not create separate news, blog, and commentary tables. Do not create an analytics warehouse. The analytics item in the reference layout should wait until a real, privacy-reviewed source exists.

## 4. Legacy WordPress links

`src/content.js` builds many links as `https://foreignafrica.org/{slug}/` unless the slug is in a small local allow-list. Those links open the current WordPress site.

### Legacy destinations still used by buttons and cards

| Destination | Where it is used | Class |
| --- | --- | --- |
| `/enterprise-development-workshop-series-edws/` | Hero, focus card, programmes menu, resource list | Legacy WordPress. Needs an internal programme page |
| `/africa-trade-job-tracker-atjt/` | Research menu, programmes menu, resource list | Legacy WordPress. Needs an internal programme page |
| `/skillshareforeignafrica/` | Programmes menu, resource list | Legacy WordPress. Needs an internal programme page |
| `/municipal-diplomacy-programme-mdp/` | Focus card, programmes menu, resource list | Legacy WordPress. Needs an internal programme page |
| `/research/` | Homepage “Explore our research” | Legacy WordPress. Missing internal page |
| `/programmes/` | Homepage “All programmes” | Legacy WordPress. Missing internal page |
| News 6231, 6227, 6184 | News cards use `url` | Legacy WordPress. Summaries exist locally. Full articles do not |
| News 7277 and 6164 | `url` is `/?story=...` | Internal story. `sourceUrl` remains the old article |

### Already internal

Commentaries, opportunity overviews, engage, contact, careers, events, policy briefs, partners, team profiles, and the two homepage news cards that use `/?story=` stay on this app. Commentary bodies also rewrite in-article WordPress links to a local commentary when the slug matches.

### Keep external

- `mailto:info@foreignafrica.org` and topic enquiry drafts
- LinkedIn profile URLs on team members
- Partner and citation sites once they are entered as partner websites
- Application portals, when an opportunity’s method is “external URL”

`sourceUrl` and `imageSource` fields are provenance. They are not the public click target. Featured images for news and commentaries are already copied under `public/images/`. WordPress `wp-content` URLs record where the file came from.

### Not converted automatically

Do not turn every `foreignafrica.org` URL into a page. Some are the live site’s own addresses and will become redirects at cutover. Some are sources for stories that are already rewritten locally.

## 5. Current frontend gaps

- One HTML title and description for the whole app. No per-page canonical URL, Open Graph tags, sitemap, or `robots.txt`.
- Public pages are client-rendered. A crawler that does not run JavaScript receives the homepage description for every URL.
- Three news cards leave the new site.
- Four programmes and two hub links leave the new site.
- Homepage, navigation, partners, policy briefs, hero, and activity stories are code, not editor fields.
- Opportunity and event pages cannot accept an application or registration. All ten form definitions are drafts, so the contact page still opens the visitor’s email app.
- The file editor has no accounts, roles, review queue, revisions, scheduling, media library, or upload check.
- The file editor cannot run on Hostinger as it is written. A deploy replaces the app folder, and submissions would need a writable path the deploy does not wipe.
- `vercel.json` does not describe the Hostinger deploy.
- Discovery still depends on a server-side Gemini key. That is separate from the CMS and must remain server-side.

No broken-image pass against the live network was run for this audit. Local image paths used by the catalogues exist in `public/images/` for the imported news and commentary covers.

## 6. Hosting compatibility

Checked against Hostinger’s current Node.js documentation on 25 October 2026. Confirm again in hPanel before deployment, because plan limits can change.

| Question | Finding |
| --- | --- |
| Node.js versions | 18, 20, 22, and 24. Use 22 LTS. |
| Express | Supported as a long-lived server. Bind to `process.env.PORT`. |
| Always on | The process sleeps after idle and starts on the next request. It is not a VPS. |
| MySQL | Supported. Host must be `127.0.0.1`, port 3306. No PostgreSQL or MongoDB on this plan. |
| Process budget | Business allows 5 Node.js websites, 120 processes, and 60 entry processes, shared with every site on the plan, including WordPress. |
| Request limit | 120 seconds. No inbound WebSockets. No always-on workers. |
| Cron | Supported for Node.js websites. UTC. 30-minute cap. Environment variables are not loaded unless the command passes `--env-file`. |
| SSL | Hostinger issues and renews certificates for the domain and subdomains. |
| Deploy and rollback | Git deploy builds a new version and switches a symlink. Older build folders are removed. Files inside `hbuilds/` and `public_html` are overwritten. |
| Environment variables | hPanel environment settings, not a committed `.env`. |
| Uploads | Must live outside `hbuilds/` and `public_html`, for example a `storage/` directory beside the domain folder, or they disappear on the next deploy. |

### Adjustment to the proposed domains

Do not run three Node applications for the public site, `admin.` and `api.`. Each one is a process, and `www` plus the apex can count as two more. The WordPress site already shares the same process budget.

Run **one** Express application:

- `https://foreignafrica.org` serves the built React app.
- `https://foreignafrica.org/admin` is the CMS.
- `https://foreignafrica.org/api` is the API.

Redirect `www` to the apex in hPanel instead of starting a second Node process. Use one extra Node app only as a staging host, such as `preview.foreignafrica.org`, and only while the apex is still WordPress.

This is compatible with Business hosting if the app stays a single process, does not spawn workers, and keeps uploads outside the deploy tree.

## 7. Recommended database

MySQL 8, InnoDB, `utf8mb4`. Queries are parameterized. Migrations are numbered SQL files applied by a small Node script.

### Identity

- `users` — email, name, `password_hash`, `status`, timestamps, `deleted_at`
- `roles` — `super_admin`, `admin`, `editor`, `contributor`
- `user_roles`
- `sessions` — hashed session id, expiry, revoked time
- `login_attempts` — for lockout that survives a process restart

Permissions stay in code, mapped from those four roles. A database permission matrix is unnecessary for the first release and is easy for an editor to lock everyone out of. Revisit only if staff need custom roles.

### Content

- `content_items` — `type` (`news`, `commentary`, `page`, `programme`), title, slug, summary, body JSON, body HTML, featured media id, author id, status, publish time, SEO title, SEO description, social image, featured flag, sort order, timestamps, `deleted_at`
- `content_revisions` — item id, editor id, snapshot, created time
- `terms`, `content_terms`
- `events` — title, slug, summary, body, start, end, venue, organiser, image, registration mode (`none`, `url`, `form`), status
- `opportunities` — title, slug, organisation, summary, body, eligibility, requirements, deadline, application mode (`form`, `url`, `email`, `none`), image, status
- `team_members`, `partners`, `publications`
- `forms`, `form_fields`, `submissions`, `submission_files`
- `media_assets` — storage path, mime, size, alt, created by
- `navigation_items`, `homepage_slots`, `settings`, `redirects`
- `activity_logs` — actor, action, subject, ip hash, created time

Status values: `draft`, `in_review`, `changes_requested`, `approved`, `scheduled`, `published`, `rejected`, `archived`.

Public queries return `published` rows whose publish time is in the past. Drafts and review states never appear in the public JSON.

Scheduled publishing is a cron script that flips due `scheduled` rows. It is not a background worker.

## 8. Backend layout

Add this beside the existing React app. Do not replace `src/` page components.

```
server/
  index.js              Express app, static files, /api, meta injection
  db.js                 MySQL pool
  migrate.js
  auth.js
  content.js
  media.js
  forms.js
  health.js
migrations/
  001_init.sql
storage/                gitignored; on Hostinger this path is outside hbuilds
```

The React admin stays in `src/admin/` and calls same-origin `/api`. Public pages keep their present components and read published JSON from `/api/public/...`.

`package.json` `start` becomes `node server/index.js` for Hostinger. `build` remains `vite build`. The server serves `dist/`.

## 9. Security architecture

- Passwords hashed with `bcryptjs`. Native Argon2 can fail to compile on shared hosting.
- Session cookie: HttpOnly, Secure, SameSite=Lax, Path=/. The session row stores only a hash of the token.
- Sessions expire and can be revoked. Logout deletes the row.
- Every mutating `/api` route checks the session on the server and checks the role in code. Hiding a button is not authorization.
- Same-origin admin and API. Reject mutating requests whose `Origin` is not the site. That covers cookie CSRF without a second token service.
- Login rate limit stored in `login_attempts`, not only in memory.
- Parameterized SQL. No string-built queries.
- Uploads: allow-list of image and PDF types, size cap, random stored names, no execution in the storage directory. Public files are served with a download content type for PDFs.
- Article HTML is produced from the editor document and passed through a sanitizer. The public site does not inject raw staff HTML from a textarea.
- Secrets only in the Hostinger environment: `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `SESSION_SECRET`, and the existing `GEMINI_API_KEY`. Never `VITE_` prefixes.
- Database user can read and write the application schema only.
- Activity log records publish, delete, login failure, user changes, and failed uploads. It does not store passwords, cookies, or full submission files.
- Submission files are private. Download requires an authenticated role.
- System health reports checks that ran. It does not claim a backup succeeded. Hostinger backups stay in hPanel until an API exists to read their status. The screen should say that plainly.

## 10. CMS experience

WordPress familiarity means list, edit, draft, publish, and a clear status. It does not mean cloning wp-admin.

Sidebar groups, shown only when the role allows them:

- Overview: Dashboard
- Content: News, Commentaries, Pages, Events, Publications
- Organization: Team, Partners
- Engagement: Opportunities, Forms, Submissions
- Website: Media, Navigation, Homepage, Redirects
- Administration: Users, Activity, System health, Settings

Blog is not a separate module. Commentaries are the journal. A “Blog” label would duplicate them.

Dashboard counts are real: published items, drafts, items in review, upcoming events, open opportunities, recent submissions, recent activity, and the health checks from section 11.

Editor: TipTap, storing a JSON document and sanitized HTML. Staff can use headings, paragraphs, bold, italic, lists, links, images from the media library, quotes, and document links. Tables and embeds wait until the core editor is in use. Building an editor from scratch is out of scope.

Actions: save draft, submit for review, preview, publish, unpublish, duplicate, view and restore a revision. Schedule uses the `scheduled` status and cron. Contributors can edit their own drafts and cannot publish. Editors can publish. Administrators manage content and submissions. Super administrators also manage users and settings.

Destructive actions confirm. The editor warns on unsaved changes. Autosave writes a draft revision, not a public row.

## 11. System health

The administration screen runs live checks:

- API process up
- MySQL `SELECT 1`
- Storage directory exists and is writable
- Count of failed uploads in `activity_logs`
- Recent error rows written by the server
- Age of the newest published item, as a content heartbeat

It does not show credentials, stack traces with secrets, or a green “backup complete” badge. Backup, restore, and deploy history are documented as hPanel procedures. If Hostinger later exposes backup status, the screen can read it. Until then the copy states that backups are outside this application.

## 12. Migration strategy

Do not scrape the live site. Do not drop the WordPress database.

1. Keep WordPress on the apex until staging is accepted.
2. Seed MySQL from the catalogues and article files already in this repository. That content was prepared for the new site and keeps titles, authors, dates, summaries, and local images.
3. For the three news cards that still open WordPress, import the article body from a WordPress export or an authorized REST export before changing the card link. If the export is not available, leave the card on the overview and do not invent the article.
4. Copy media into the external storage directory. Keep the current `public/images` files as the seed so the first deploy is not an empty library.
5. Record each old path in `redirects` only when the new internal page is published.
6. Compare counts: 12 commentaries, 5 news items, 3 events, 10 people, 6 partners, 2 policy PDFs, 5 opportunity overviews.
7. Check missing images, duplicate slugs, and that draft forms are still draft.
8. Cut over by deploying the Node app to the apex and leaving WordPress files and database in place, restorable from hPanel.
9. Write `docs/MIGRATION_REPORT.md` after the import. That report does not exist yet.

Programme pages that were never rebuilt stay as redirects to WordPress until an editor publishes a real page. Removing the link without a page would hide the programme.

## 13. SEO

Client-side React alone is not enough. The Express server should return the built `index.html` with the route’s title, description, and canonical URL injected for public content URLs. That is not a second frontend and not a full React server render.

Also add:

- Stable slugs matching the current public paths where those paths already exist
- `sitemap.xml` and `robots.txt` generated from published rows
- Open Graph title, description, and image
- Width and height on images that already have them, and lazy loading below the hero
- The existing Vite code splitting

JSON-LD for articles and events can follow after titles and canonical URLs are correct.

## 14. Phased implementation

No phase starts until this document is approved.

1. **Foundation.** MySQL migrations, session auth, roles, activity log, health check, and tests for login and rejected anonymous writes. Public site unchanged.
2. **Content core.** `content_items`, revisions, TipTap, news and commentaries, media upload to external storage. Public commentary and news pages read the API. WordPress news links change only when the body is present.
3. **Organization and listings.** Events, opportunities, team, partners, publications. Homepage slots for hero and featured items, backed by structured fields.
4. **Engagement.** Form builder, submissions, private files, contact page switches to a published form.
5. **Website admin.** Navigation, redirects, SEO fields, sitemap.
6. **Workflow.** Review states and contributor role. The schema includes them from phase 1 so this is behaviour, not a new migration.
7. **Staging and cutover.** Staging subdomain, migration report, then production deploy after explicit approval.

The current file editor remains until phase 2 replaces it. Do not maintain both writers against different stores.

## 15. Testing

Automated tests for login, logout, expired session, role denial, create, edit, publish, unpublish, public hiding of drafts, upload type rejection, form validation, and redirect lookup. Existing `node --test tests/*.test.js` stays. Public page tests keep covering routes that this work must not break.

Browser checks, after UI work, cover desktop and a phone width for the public page that changed and for the editor screen that changed.

## 16. Risks and decisions needed before implementation

1. **Cutover window.** The apex cannot be WordPress and this Node app at the same time. Staging on a subdomain is the safe path. Confirm that a subdomain is available.
2. **WordPress export.** Three news articles and four programme pages are not fully in this repository. Who can provide a WXR or REST export, and which programmes should become pages rather than redirects?
3. **Staff list.** How many people need accounts, and who is the first super administrator? The shared editor password goes away once accounts exist.
4. **Review workflow.** The schema supports review. The first release can let editors publish directly if the team is small. Confirm whether contributors exist on day one.
5. **Upload location.** Confirm the Hostinger account can create a directory outside `hbuilds/` and `public_html`. If it cannot, media cannot survive deploys and the CMS should not promise uploads.
6. **Storage quota and PHP upload limits** on the same plan are not visible from this repository. Measure them in hPanel before setting the file size cap.
7. **Gemini discovery** stays a separate server feature. It is not part of the editorial CMS.
8. **Analytics** from the reference layout is deferred. A chart without a real source would mislead staff.
9. **Backups** remain an hPanel responsibility. The health screen will not invent a success state.
10. **Idle sleep** on Hostinger makes the first request after a quiet period slower. That is acceptable. It is not a reason to add a second always-on service this plan cannot run.

## 17. Recommendation

Approve a single same-origin Express and MySQL application on Hostinger Business, seeded from the content already in this repository, with uploads stored outside the deploy directory. Keep the public React design. Replace the file editor rather than extending it. Wait for the decisions in section 16 before writing that backend.
