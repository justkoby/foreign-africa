# Commentaries archive redesign

## Content and scope
The new local `/blog/` listing uses all 12 published Blog-category posts returned by Foreign Africa’s public WordPress API on 25 October 2026 (`/wp-json/wp/v2/posts?per_page=100&_embed=1&orderby=date&order=desc`, category ID 1). It includes older archive entries beyond the ten visible cards on the current landing page. News-category reports remain separate.

Original titles, publication dates, article destinations and actual bylines in the article bodies are preserved in `src/pages/commentaries-content.js`. The generic WordPress account name “Communications” is not substituted for a named author. Topic labels and short descriptions are editorial browsing aids derived from each article, not original WordPress taxonomy. Reading times are estimates from source text at 220 words per minute. Article claims have not been independently fact-checked or updated.

The twelve original featured images are downloaded from their published WordPress media URLs, resized within 1400×1000, converted to WebP and served locally. Their source URLs are retained per record. Source photographs were not AI-generated or retouched. CSS crops thumbnails for layout; images are decorative within titled links.

The listing and all twelve full article bodies now use local routes at their original slugs. `/blog/<slug>/` aliases also resolve. Body JSON and all 46 inline images are served locally. Editorial text, emphasis, links and images are retained; a copied Substack subscription widget is removed. The reader uses safe structured nodes, not injected WordPress HTML. There is no live WordPress synchronization, CMS editor, comment system or subscription backend.

## Browsing
The latest publication is featured when the visitor first arrives. Six additional cards appear initially; More commentaries reveals the remaining five. Keyword, topic and year filters plus oldest/newest sorting operate over all twelve items. The featured card is folded back into filtered results, so there are no duplicate cards or missing matches. Counts report the actual displayed and matching articles. Empty states and reset controls are included. Loading more moves keyboard focus to the first newly revealed card.

`/commentaries/` and `/category/blog/` are aliases. Homepage and mega menu commentary destinations now use `/blog/`. Smart Discovery indexes the local article destinations. Filtering and searching use bundled metadata and send no questions or keystrokes to an AI provider.

## Files
- `src/pages/CommentariesPage.jsx`: archive presentation and controls.
- `src/pages/commentaries-content.js`: publication metadata and provenance.
- `src/pages/commentaries-search.js`: filtering, ordering and date formatting.
- `src/pages/commentaries.css`: scoped responsive styles and reduced-motion rules.
- `public/images/commentaries/`: twelve optimized featured images.
- Shared page routing, navigation, document title and discovery entries are updated.

## Validation
All 33 Node tests pass. The production build and whitespace checks pass. Desktop, 390px and 320px iframe viewports were visually reviewed in Chrome. Topic filtering, no-results/reset, loading the remainder of the archive, year filtering and oldest-first sorting were exercised. The browser checks were on an internal preview; this update has not been deployed or pushed to GitHub.
