# Studio design system (v2)

Admin only (`src/studio/ui/ui.css`, `src/studio/ui/index.jsx`). The public site never loads it; its Mark Pro typography is untouched.

- **Direction:** WordPress-level function in a modern SaaS dashboard: warm grey canvas, white cards, 12/18px radii, soft shadows, pill chips, deep navy primary actions, muted gold accent on the active nav item. No heavy dark areas or gradients.
- **Type:** Inter 400-700 (`@fontsource/inter`). Page title 30px, section 18-22px, card/row 15px, body 14px, labels 12-13px.
- **Tokens:** `--fa-*` colour, status (green/blue/amber/violet/red/slate), radius, shadow, focus ring; `--fs-*` scale.
- **Components:** Button/IconButton, Chip/StatusChip, Avatar, Card/KpiCard/PageHeader, SearchField, Select, Field, Switch, Tabs, Pagination, EmptyState, Skeleton, Notice, Menu, Modal, toasts and confirmation dialogs (`useFeedback`). Icons are Lucide; no emoji.
- **Shell:** collapsible grouped sidebar (unfinished modules grouped under Site content and Engagement), sticky top bar with breadcrumbs, search, New menu, account menu. Off-canvas under 900px.
- **Screens on the system:** Login, Dashboard (real data via `GET /api/staff/overview`), content listings (status tabs with real counts, search, sort, bulk actions), editor (slim action bar, large title, paper canvas, collapsible tabbed panel: Document / SEO / History; Tiptap, autosave, revisions, media insertion and permissions unchanged), media library (grid/list, truncated names, "Size unavailable" instead of a wrong "0 KB"), users (table, role/status chips, add-user dialog), account, activity, system health, settings.
- **Not yet restyled:** hero/homepage editors, terms, submissions and legacy collections use the old layout under a `.fa-legacy` bridge that applies the new tokens.
- **Deliberately not built:** no invented analytics or trends; no page builder.

---

## Earlier notes

# Foreign Africa CMS: Admin Design System (draft)

> Status: Inter is now applied to `/admin` and `/editor` (self-hosted via `@fontsource/inter`, latin 400/500/600). The rest of this document is the target for roadmap step 2. Navigation below must be reconciled with the existing Studio module list and the unbuilt-module placeholders.

Scope: the **admin UI only**. The public site's Mark Pro typography and CSS are untouched. The admin ships as a separate entry with its own stylesheet so neither can leak into the other.

## Principles
WordPress-familiar structure; dense but readable; navy/gold used for identity accents (active nav, primary button, focus ring), never for large decorative surfaces. No gradients, emoji or decorative illustrations. Lucide icons only (already a dependency).

## Typography
Family: **Inter** (SIL OFL), self-hosted WOFF2 subset, `font-display: swap`, fallback `system-ui, -apple-system, "Segoe UI", sans-serif`. Weights 400/500/600.

| Token | Size / line | Weight | Use |
|---|---|---|---|
| `--text-xs` | 12 / 16 | 500 | badges, table meta |
| `--text-sm` | 13 / 20 | 400 | tables, helper text, nav |
| `--text-base` | 14 / 22 | 400 | body, inputs |
| `--text-md` | 16 / 24 | 500 | card titles |
| `--text-lg` | 20 / 28 | 600 | page title (H1) |
| `--text-xl` | 24 / 32 | 600 | dashboard headline only |
Editor canvas body: 17/28, readable measure ≤ 72ch.

## Colour tokens (candidates; verify contrast ≥ 4.5:1)
- `--navy-900 #0B1F3A` (nav, primary), `--navy-700`, `--gold-500 #C9A24B` (accent/focus; not for text on white)
- Neutrals: `--gray-50 #F6F7F9` page, `--gray-200 #E1E5EA` borders, `--gray-600 #55606E` secondary text, `--gray-900 #14181F` text
- Status: success `#1E7B4A`, warning `#9A6700`, danger `#B3261E`, info `#1D5FA8`, each with 10% tint backgrounds. Status always paired with an icon/label, never colour alone.
Final hexes must be taken from the public site's stylesheet during Stage B.

## Layout
- Sidebar 240 px (collapsed 56 px); top bar 48 px; content max-width 1280 px; editor uses main column + 320 px settings sidebar.
- Spacing scale 4/8/12/16/24/32. Radii 4 (inputs, buttons), 6 (panels), 999 (badges).
- Table row height 44 px (compact 36 px), sticky header, row actions on hover **and** focus, bulk-action bar above table.
- ≤ 960 px: sidebar becomes an overlay drawer; settings sidebar becomes a tabbed panel below the editor.

## Components (build once, reuse)
Button (primary/secondary/ghost/danger, loading), Field (label, helper, error), Select/Combobox, Toggle, Tabs, DataTable (search, filter, sort, pagination, bulk), Modal (focus-trap, Esc), Toast, Banner, Empty state, Skeleton, Breadcrumbs, Status badge (Draft, Scheduled, Pending review, Published, Archived, AI-suggested), Media picker, Confirm-destructive dialog.

## Accessibility
Visible 2 px focus ring, full keyboard operation, `aria-live` for save/autosave status, `prefers-reduced-motion` respected, minimum 40 px touch targets on mobile, form errors tied via `aria-describedby`.

## Navigation (role-filtered; modules registered in one config so future modules can be added)
Dashboard · Content (Posts/Commentaries, News, Pages, Media, Categories & Tags) · Foreign Africa (Homepage, Hero, Programmes, Team, Partners, Policy Briefs, Events, Opportunities, Recordings) · Engagement (Forms, Submissions) · AI Assistant (Writing, Templates, Usage) · Administration (Users & Roles, Menus, SEO & Redirects, Settings, Activity Log).
Merge redundant entries: "Contact Enquiries" and "Applications" are filtered views of Submissions, not separate modules. "Activity" lives on the dashboard and the Activity Log.

## Dashboard rule
Every figure is a live query (drafts, scheduled, pending review, new submissions, recent edits). Hide a widget instead of showing a zero-filled placeholder when the module is disabled for the role.
