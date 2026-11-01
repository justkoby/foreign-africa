# Homepage and hero editor

Studio → Foreign Africa → **Hero slider** and **Homepage sections**. Verified in a real browser against MariaDB 11.8.9, by automated tests on MariaDB 11.8.9 and MySQL 8.0.46, and by pixel comparison against the unchanged site. Not deployed.

## What staff can and cannot change
Staff change **values inside predefined fields**. The design is not a field, so it cannot be changed from the CMS.

| Staff can edit (approved fields) | Developer-only (not editable, rejected by the server) |
|---|---|
| Hero: headline lines, small label, description, button text and link, picture for large screens and phones, approved video and its poster, "watch" button, time on screen (8–20 s), shown/hidden, order, add, duplicate, delete | Slider layout, markup and component structure, transitions and animation, styling and CSS, breakpoints, typography, JavaScript, the crop treatment of a prepared image, new video sources |
| Homepage: text, headings, links and buttons, photos (from the media library), which stories are featured, which partners show and in what order, programme list | Section order and layout, class names, fonts, spacing, the evidence statistics card, partner logos and names (managed with partners), the opportunity pathway cards |
| | Database migrations, deployment, environment, approved hosts and video list |

Enforcement is on the server, not in the screen. Every save is checked against a strict schema (`server/site-fields.js` and `server/site-schema.js`): unknown fields (CSS, `className`, `style`, `html`, layout, transitions, breakpoints…) are rejected, text may not contain markup, and limits apply to every field. The editor forms are generated from the same field definitions, so what is validated is what is shown.

Content rules: links must be pages on the site, `#sections`, `mailto:`, or `https://` on `foreignafrica.org`, the site's own host, or hosts a developer adds with `CTA_EXTRA_HOSTS`; `javascript:`, `data:`, look-alike hosts (`foreignafrica.org.evil.com`) and credentials in URLs are refused. Images must be library images or existing built-in images (never a pasted URL). Video must come from the approved list (`server/site-approved.js`) or be a YouTube link, which is reduced to its id. Hero: 1–8 slides, durations 8–20 s, unique slides, at least one shown to publish.

## Draft and live are separate
- Every area has a **draft** and a **live** copy. The public site only ever reads the live copy.
- **Save draft** never changes the live site. **Publish** is a separate, explicit, confirmed action; nothing publishes automatically.
- A banner always shows the state: "The draft matches the live website", "Saved draft has changes that are not live yet (saved by …)", or "You have unsaved edits".
- **Preview** loads the real website (the actual components and styles) with your saved draft inside, at desktop (1440 px) or mobile (390 px) width, or in a new tab. It is login-only, never indexed, never cached.
- **Earlier versions**: every save and publish is recorded; "Restore to draft" puts an old version in the draft only. **Discard draft changes** returns to the live version.
- New and duplicated slides start **hidden**, so an unfinished slide cannot appear by accident.
- Two people editing at once cannot silently overwrite each other: a save based on an outdated draft is refused with a clear message.

## Roles
| | Contributor | Editor | Administrator | Super Admin |
|---|:-:|:-:|:-:|:-:|
| Open the editors, save drafts, preview, restore, discard | | ✔ | ✔ | ✔ |
| Publish | | only if an administrator allows it | ✔ | ✔ |
| Allow or withdraw editors' publishing | | | ✔ | ✔ |

The switch is in the homepage editor ("Allow editors to publish…") and defaults to off. Every save, publish, discard, restore and permission change is recorded in the activity log.

## How the public site gets the content
The server embeds the published content in the page HTML, so the first render already shows it (no flash of old content). If nothing is published, or anything is missing, the built-in content applies: the content the site launched with, in `src/homepage-defaults.js` and `src/hero-content.js`. Publishing that same content changes nothing.

## Visual verification (desktop 1440×900 and mobile 390×844)
Baseline captured before any change: 43 screenshots (5 hero slides and a full scroll series at each size) plus DOM. Two captures of the unchanged site: **0 pixels differ**.

| Comparison | Result |
|---|---|
| After moving the content out of `main.jsx` (built-in defaults) | 43 of 43 identical, DOM identical |
| Default content published through the CMS (validated, stored, server-injected) | 43 of 43 identical, DOM identical |
| One sentence edited and published | 2 of 43 differ (the frame showing that sentence at each size, about 140×23 px); everything else identical |

Tooling and how to re-run it: `scripts/visual-regression/`.

## Tests
`tests/site-schema.test.js` (13, pure): the live content round-trips through the validators unchanged; developer-only fields, markup, hostile links, images, videos, limits. `tests/site-content-mysql.test.js` (12, real database): drafts are private, roles, concurrency, publish, restore, discard, preview, HTML injection safety, media usage. A 26-step browser run covers the editors end to end.

## Roadmap items from your list (not done yet)
- Submit-for-review workflow for contributors: **not implemented**.
- Improved revision comparison (word-level diff): **not implemented**.
- Image cropping and focal-point controls: **not implemented**. Hero pictures have a position preset (centre, left, right, top, bottom) only.
- Self-hosted video: **not implemented**; the approved-video list has one video. Needs a decision on storage and bandwidth.
- Expanded media usage tracking: **partly**. Articles, the homepage and the hero are tracked and block deletion; team, partners and other modules will be added as those modules are built.

## Other limits
- Only sections that exist on the public site are editable. Featured stories are chosen from the existing stories; selecting database news articles for the homepage cards is not built.
- Partner names and logos are not editable here; only which appear and in what order.
- Adding a new editable field, section or video is a developer change (field definition, default, component, test).
- The mobile and desktop previews need a built site (`npm run build`); they are not available in the Vite dev server.
