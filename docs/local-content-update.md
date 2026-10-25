# Built-in commentaries and internship programme

The earlier archive redesign left commentary destinations on the original WordPress site, and opportunity navigation still sent internship visitors there. This update completes those routes locally.

- All 12 full commentaries have their original top-level slugs and `/blog/<slug>/` aliases. Archive cards, featured links, related articles and Smart Discovery use local destinations.
- Full bodies are stored as structured editorial nodes in `public/content/commentaries/`. The reader fetches one article at a time, provides loading/retry states and renders allowlisted elements without injecting HTML. Text, emphasis, editorial links and all 46 inline images are retained. Only a copied Substack subscription widget is removed. Editorial links between migrated commentaries are localized at render time.
- Images are downloaded and converted to local WebP assets, with original URLs retained as provenance. No external WordPress connection is needed for article reading. Source images have not been generated or retouched.
- The Remote Internship Programme uses the opportunity detail template, based on its published programme overview. Navigation, hero, People, homepage, opportunity FAQ, Careers and search destinations use its local route. This overview does not assert a current intake, deadline or application form.
- The CMS contract adds `internship_application` to the versioned form builder, for an opportunity-owned intake. There is no live application or submission service in this update.

Source: Foreign Africa public posts API, category 1, and the Remote Internship Programme overview, reviewed 25 October 2026. Titles, publication dates and author metadata are retained from the earlier verified catalogue. This is a static content snapshot, not automatic CMS synchronization. Other programmes and original-source report links outside these migrated sections still require their own migration before a complete WordPress cutover.

Validation: 47 Node tests, production build and whitespace checks. Full article text compared to the source with whitespace normalized, excluding the copied subscription widget. Desktop, 390px and 320px reading views checked in Chrome, including image display and horizontal overflow. Archive-to-article navigation verified. No push or deployment.
