# Foreign Africa CMS: Feature Gap Analysis

Classification scale: **FF** fully functional · **FI** functional, needs improvement · **PI** partially implemented · **UI** UI placeholder only · **MI** missing · **BR** broken/unreliable.
Basis: commit `f1b7841`. "Frontend" = public site data model or rendering; "Backend" = persistence, API, auth.

| Area / feature | Frontend | Backend | Class | Notes / reuse |
|---|---|---|---|---|
| **Auth & session** | n/a | none | MI | No login, sessions, CSRF, password reset |
| **Roles & permissions** | n/a | boolean `content_editors` in unapplied SQL | MI | Need 5-role matrix enforced per endpoint |
| **Admin shell / nav** | none | none | MI | No `/admin`; no dead buttons exist because no admin UI exists |
| **Dashboard / activity** | none | none | MI | No data store to report on |
| **Posts / news editor** | Public story pages render static data | none | MI | Reuse story data shape; build editor (Tiptap) |
| **Rich-text / sanitisation** | No `dangerouslySetInnerHTML` anywhere (good) | none | MI | Decide stored format (Tiptap JSON → sanitised HTML or safe block JSON) |
| **Drafts / scheduling / publish** | `published` flag on hero; `published_at` rule in SQL | none | PI | Rules sketched in SQL, nothing running |
| **Revisions / autosave** | none | none | MI | Not in draft schema |
| **Media library** | Static files in `public/`; `SourcePhoto` clipping | none | MI | No upload, metadata, optimisation, usage tracking |
| **Categories / tags** | Topic tags in `discovery.js`, filters in commentaries | none | PI | Static vocabularies only |
| **Hero slider (render)** | Full: video/image, mobile fallback, swipe, pause, reduced motion, YouTube allowlist | n/a | FF | Preserve untouched |
| **Hero management (edit)** | n/a | none | MI | Data model ready; needs editor + validation |
| **Homepage sections** | Rendered from inline JSX | none | PI | Must extract to data first |
| **Team & leadership** | Group pages, 10 profiles, 10 interns | none | PI (render FF) | Data-driven rendering exists; no CRUD |
| **Partners** | Logo strip + `/partners/` | none | PI (render FF) | 6 records; add links/description fields |
| **Policy briefs** | Catalogue + reader (page images, text, zoom, download) | none | PI (render FF) | Reader works; PDF→assets pipeline is offline Python |
| **Events** | Past workshop shown as past; no events module | none | MI | Needs registration-mode + expiry logic |
| **Opportunities** | 4 pathway pages, honest status text | none | PI (render FF) | No vacancy/deadline/application model |
| **Recordings** | Planned in Discovery empty state | none | MI | |
| **Commentaries** | Archive with filters, 12 records, progressive loading | none | PI (render FF) | Bodies still on WordPress |
| **Forms builder / submissions** | none (mailto-style enquiries) | none | MI | No private-data store |
| **Navigation menus** | Mega menu from `menu-content.js` | none | PI (render FF) | Static |
| **SEO / redirects** | No per-page meta management seen; WordPress URLs preserved by absolute links | none | MI | |
| **Settings / activity logs** | none | none | MI | |
| **Smart Discovery (public)** | Dialog, filters, honest fallbacks | `api/discover.js` + Gemini | FI | Works with mocked tests; rate limit and proxy issues (see audit); catalogue is static |
| **Gemini editorial assistant** | none | none (only public discovery endpoint) | MI | Reuse patterns, not the endpoint |
| **AI knowledge/grounding** | none | none | MI | |
| **AI usage limits / cost tracking** | none | in-memory limiter only | MI | |
| **Tests** | 37 Node tests (content, search, hero, endpoint) | n/a | FI | No browser, auth, permission or migration tests |
| **Backup / recovery** | none | none | MI | |
| **Deployment** | Vercel config only | none | MI for Hostinger | |

## Gap summary

- **Fully functional (keep as is):** hero rendering, document reader, public inner pages, Discovery UI.
- **Partially implemented:** render side of every Foreign Africa module (data-driven where it matters), so the CMS can plug in beneath them.
- **Missing:** everything that makes it a CMS: auth, roles, storage, editor, media, revisions, forms, settings, logs, admin UI, editorial AI.
- **Broken/unreliable:** nothing misleadingly broken; the one correctness risk is the Discovery rate-limit key off Vercel.

There are no UI placeholders to retire. That is good: the backend and admin UI can be built without fighting fake controls.
