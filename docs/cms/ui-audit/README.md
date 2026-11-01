# Studio UI/UX overhaul: before and after

Baseline = a local replica of the staging Studio with realistic data (not the live Hostinger site, which was not contacted).
Capture: `node scripts/ui-audit/serve.mjs` then `node scripts/ui-audit/capture.mjs http://localhost:4400 <dir>`.

| Screen | Before | After |
|---|---|---|
| Dashboard | before-dashboard-1440.png | after-1440-dashboard.png |
| News listing | before-news-1440.png | after-1440-news.png |
| Editor | before-editor-1440.png | after-1440-editor.png, after-tablet-editor.png |
| Login | before-login-1440.png | after-1440-login.png |
| Media, Users, System health | (legacy, unstyled) | after-1440-media/users/health.png |
| Mobile listing | | after-mobile-news.png |
