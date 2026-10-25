# Foreign Africa

React + Vite homepage redesign, using Africa Practice as the lead layout reference and preserving Foreign Africa’s navy/gold identity.

## Run

```sh
npm install
npm run dev
npm test
npm run build
```

Deploy the generated `dist` directory to a static host (Vercel preset: Vite).

## First design pass

Responsive homepage, mobile navigation, keyboard-accessible search dialog with category filters, programme accordion, focus areas, opportunities and partnership routes. Content and locally stored brand/photography assets come from foreignafrica.org. Programme and research detail links intentionally point to the current website during the rebuild. No open application status, invented publication titles, impact statistics or testimonials are implied.

The research illustration is decorative, not a data visualisation. Search matches the local content catalogue; it does not use AI. The CMS, authentication, subscriptions, AI answers and full content migration are not implemented in this first design pass. No credentials are needed or included.

## Assets

`public/images/logo.png`, `engagement.jpg` and `partners.webp` are sourced from the existing Foreign Africa website. The wordmark is rendered as text alongside the existing brand symbol. External Google Fonts have system font fallbacks.
