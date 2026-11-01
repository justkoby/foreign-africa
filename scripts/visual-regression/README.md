# Homepage visual regression

Proves the homepage looks exactly the same before and after a change. The capture is deterministic: two captures of an unchanged site differ by 0 pixels.

1. Build and start the site, for example `npm run build && PORT=4190 APP_ENV=development node server/index.js`.
2. `node scripts/visual-regression/capture.mjs http://localhost:4190 /tmp/vr/baseline` (needs `npm i --no-save playwright`).
3. Make the change, rebuild, capture again into another folder.
4. `python3 scripts/visual-regression/compare.py /tmp/vr/baseline /tmp/vr/after` (needs Pillow).

`published.mjs` does the same for CMS-published content: it publishes the default content through the API and captures the result, so the server-injected path can be compared against a baseline of the built-in content.

Third-party media (Cloudinary, YouTube) is blocked during capture so results do not depend on the network. Baseline images are not committed because they are large; capture them from the commit you are comparing against.
