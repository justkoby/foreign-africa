# Content editor, media library and taxonomy

What staff can do in the Studio (`/admin`) after Roadmap Step 4. Tested in a real browser against MariaDB 11.8.9 and by automated suites on MariaDB 11.8.9 and MySQL 8.0.46. Not deployed.

## Editor (News, Commentaries, Pages, Programmes)
Layout follows WordPress's block editor: a sticky top bar (status, save state, Preview, Save draft/Update, Publish), the title and permalink, a formatting toolbar, the writing canvas, and a settings sidebar made of collapsible panels. On a phone the sidebar stacks below the canvas.

| Area | What it does |
|---|---|
| Formatting | H2–H4, bold, italic, underline, bulleted and numbered lists, quote, divider, links (inline form, not a browser prompt), undo/redo, `Ctrl/Cmd+S` to save |
| **Tables** | Insert 3×3 with a header row; add/delete rows and columns, toggle header row, merge/split cells, delete table. Cells hold text and lists only. Limits: 100 rows, 20 columns, 1,000 cells. Rendered responsively (scrolls sideways inside its own box on phones) |
| **Video** | YouTube only (`youtube.com`, `youtu.be`, `youtube-nocookie.com`; watch, embed, shorts, live links). Only the 11-character id is stored and the embed address is rebuilt on the server, so no pasted URL or attribute reaches the page. Other video sites are refused with a clear message. Optional title (for screen readers) and caption. Rendered through `youtube-nocookie.com`, lazy-loaded |
| Images | Inserted from the media library with alt text and caption editable in place. Added after the selected block, never inside a table, and never replacing the block you just inserted |
| Documents | Link a PDF from the library |
| **Drafts and autosave** | Drafts autosave about 5 seconds after typing stops. Published and scheduled items are never changed behind the author's back (use Update) |
| **Scheduling** | Date and time picker (your local time zone), Schedule/Reschedule/Cancel schedule. Goes live on time even without a cron job (see `CRON_SCHEDULING.md`) |
| **Publish checklist** | Blocks Publish and Schedule when the title or body is empty. Warns (does not block) about a missing excerpt, meta description, featured image, over-long SEO title or description, and images without alt text |
| Preview | Opens the server-rendered page in a new tab; a draft is saved first. For published items it shows the last saved version and says so |
| **Revisions** | Every save is recorded. List, view a revision's text, restore (restored as a draft) |
| **Categories and tags** | Pick an existing category; editors can add a new one. Tags are chips with suggestions from existing tags. Typing a differently cased name reuses the existing term; it no longer renames it |
| Featured and social image | Chosen from the library; the featured image shows a warning when it has no alt text; fit option |
| Search appearance | SEO title and meta description with live counters and a search-result preview |
| Unsaved changes | Browser warning on tab close, and a prompt before in-app navigation discards edits |
| Content list | Search, status filter, sort, pagination, checkboxes with **bulk** Publish / Move to draft / Archive / Delete (permissions checked per item; up to 50; audited) |

## Categories and tags (Studio → Content → Categories and tags)
List with usage counts, add, rename and change the slug (updates every item), and delete. Deleting a term that is in use requires a choice: **merge** its items into another term of the same kind, or remove it from them. Available to Super Administrator, Administrator and Editor (`terms.manage`); everyone with content access can read terms for the editor's suggestions.

## Media library (Studio → Content → Media library, and the picker dialog inside the editor)
- Grid and list views (remembered), search over file name, title, alt text and caption, type filter (images / documents), sort (newest, oldest, name), pagination.
- Multi-file upload by button or drag-and-drop with per-file progress and errors. Content is validated by file signature (JPEG, PNG, WebP, GIF, PDF), size-limited, and images are resized and given a thumbnail on the server.
- Details panel: dimensions, size, type, upload date, address; editable **title, alt text and caption** (contributors may edit their own uploads; staff who can edit any content may edit all).
- **Where it is used:** the pages that use the file as featured image, social image or in the body.
- **Replace file:** the id and address stay the same, so every page updates at once. Only the same kind (image for image, PDF for PDF); the old file is removed only after the database update succeeds; metadata is kept. Needs permission to edit any content.
- **Safe delete:** blocked while any page uses the file; the button explains why. Built-in site images can be chosen but not replaced or deleted.
- Caching: files are served with an ETag and revalidation (not a year-long immutable cache), so a replaced file shows for everyone within minutes.

## Permissions
| | Contributor | Editor | Admin | Super Admin |
|---|:-:|:-:|:-:|:-:|
| Write and save own drafts, upload media, edit own media metadata | ✔ | ✔ | ✔ | ✔ |
| Publish, schedule, archive, bulk actions, edit any item, replace media, manage terms | | ✔ | ✔ | ✔ |
| Delete an unused media file | | ✔ | ✔ | ✔ |
| Delete content | | | ✔ | ✔ |

## Fixed on the way
- `/media/:id/thumb` URLs were returned by the API but the route did not exist (thumbnails 404'd); now served.
- A cell could hold a video or image; blocks now go after the table, and the server enforces text-and-lists-only cells.
- Typing a category with different capitalisation silently renamed it site-wide.

## Known gaps (not done in Step 4)
- No block drag-and-drop reordering UI beyond what the editor provides by default; no column layouts or decorative blocks (deliberate: they risk breaking responsive layouts).
- No author-to-editor *review* workflow: non-publishers can only save drafts (the review statuses exist in the database but are not reachable from the UI). This belongs with the roles work.
- Video: YouTube only (as agreed). No self-hosted video upload.
- Image editing (crop, focal point) is not included.
- Media usage covers content items; usage by the homepage, team, partners and other modules will be added as those modules are built.
- Revision compare shows the revision's text, not a word-level diff.
- Accessibility is built in (labelled controls, keyboard operation, live status) but has not had an audit with assistive technology.
