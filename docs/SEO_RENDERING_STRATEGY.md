# SEO rendering strategy

## The problem

The public site is one `index.html` shell. The visible page is drawn by React after JavaScript runs. A crawler that does not run JavaScript would otherwise see the same title and description for every URL.

## Choice

The same URL is served to visitors and crawlers. `server/site.js` and the Vite dev middleware inject the article into that shell before JavaScript runs. React then replaces `#root` and draws the designed page. The server does not choose a different page from the user agent.

Injection adds the title, description, canonical URL, Open Graph tags, Article or NewsArticle JSON-LD, and the article body inside `#root`. The HTML is the sanitized `body_html` already stored for the article.

`/api/public/content/{type}/{slug}?format=html` still returns that document for the studio preview and for tests.

Public paths:

| Type | Browser path | Canonical path |
| --- | --- | --- |
| News | `/news/{slug}/` | `/news/{slug}/` |
| Commentary | `/{slug}/` and `/blog/{slug}/` | `/{slug}/` |

`/blog/{slug}/` resolves the same commentary and its canonical tag points at `/{slug}/`. That matches the existing commentary URLs. Phase 1 had proposed `/blog/{slug}/` as the canonical path. The live site and the React routes use the root slug, so Phase 2 follows that.

An incomplete news row, one with `external_url` and no article text, redirects with 302 to its existing `https://foreignafrica.org/...` URL. The React page does the same after it loads. No invented body is injected.

`/robots.txt` allows crawling only when `APP_ENV=production`, and points at `{PUBLIC_SITE_URL}/sitemap.xml`. The sitemap lists published MySQL articles only. Drafts are excluded. Other environments, including staging, send `Disallow: /` and the sitemap route returns 404.

Staging HTML uses `noindex,nofollow`. If `APP_ENV=staging` and `PUBLIC_SITE_URL` is `foreignafrica.org` or `www.foreignafrica.org`, the renderer refuses to build the page so a preview cannot advertise the production URL as its canonical.

Set `PUBLIC_SITE_URL` on staging to `https://preview.foreignafrica.org`.

A single-segment path that is not an existing React route is treated as a commentary slug. If MySQL has no published row, the page says the commentary is not available. It does not fall back to the JSON catalogue.

## Verification on 25 October 2026

`tests/document.test.js` checks the injected shell for the title, article sentence, canonical URL, Open Graph tags, and staging `noindex`, without running the page in a browser.

`tests/phase2-mysql.test.js` fetches the raw HTML of `/blog/{commentary-slug}/` from `createSite` and finds the article sentence and the root canonical URL. The same test checks that the production sitemap omits a draft and that an incomplete news URL returns 302 to `foreignafrica.org`.

Localhost has no database. `/news/` and `/blog/` therefore show an error after JavaScript runs. Their initial shell is the generic `index.html`, because there is no article to inject. That was confirmed in the browser on 25 October 2026.

## Not done

Homepage, events, programmes, and people pages are still the React shell without a per-URL article injection. The discovery assistant still reads the static directory.
