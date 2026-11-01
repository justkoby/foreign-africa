# Scheduled publishing and the cron endpoint

Status: **built and tested; not activated.** No scheduler has been configured, nothing is deployed, and no hosting setting was changed. Connect a scheduler only after you approve and after Hostinger's capabilities are confirmed (see "Verify first").

## Design: three independent layers

| Layer | What it does | Depends on |
|---|---|---|
| 1. Query-time visibility | A `scheduled` item whose time has passed is returned by every public query and the sitemap as if published | Nothing |
| 2. Opportunistic promotion | Public reads and staff screens call a throttled `promoteDue()` (at most one run a minute per process) that flips due items to `published` and logs them | Visitors or staff |
| 3. **Cron endpoint** `POST /api/cron/publish` | Does the same promotion on a schedule even when nobody visits | An external scheduler |

Layers 1 and 2 are the fallback and stay on whether or not cron is configured. Cron makes the stored status (and the activity log) timely when traffic is low; it is not required for content to go live on time.

## Safe to repeat and to run concurrently
`promoteScheduled()` runs in one transaction: it locks the due rows (`SELECT … FOR UPDATE`), sets them to `published`, and writes one `content.published` activity entry per item. Concurrent callers (cron, visitors, staff) queue on the lock; the second finds nothing due. Tested with 12 simultaneous requests and 3 due items: exactly 3 promotions and 3 log entries in total, and a replay promotes 0. A deadlock (two writers locking in a different order) is retried once. A replayed or duplicated request therefore has no side effect beyond a harmless no-op.

## Endpoint contract
`POST https://<site>/api/cron/publish` with header `Authorization: Bearer <CRON_SECRET>` and an empty body.

| Result | Meaning |
|---|---|
| `200 {"ok":true,"promoted":N,"at":"…"}` | Run completed (N may be 0) |
| `401` | Missing or wrong token (generic message; the cause is not revealed) |
| `404` | `CRON_SECRET` is not set, or is shorter than 32 characters, so the endpoint is disabled |
| `405` | Not a POST |
| `400` | Not HTTPS (staging and production only) |
| `429` | Rate limited: 30 requests a minute per client, and 5 failed attempts per 15 minutes per client |
| `500` | The run failed; details are in the server log and activity log (`system.error`), never in the response |

## Security properties
- **Secret only in the server environment** (`CRON_SECRET`, at least 32 characters; shorter values are treated as unset). It is never returned, logged, or stored.
- **Header only.** A token in the URL or any other header is ignored, because URLs end up in logs.
- **Constant-time comparison** (length-independent) against the secret.
- **HTTPS required** in staging and production, honouring the reverse proxy's `X-Forwarded-Proto`.
- **Rate limited per client address** (uses the proxy-resolved IP, so one client cannot exhaust the limit for others). Counters are in memory; they reset on restart and are per process.
- **Staging gate:** staging normally requires a Basic-Auth password for every request. A scheduler cannot send two `Authorization` headers, so this one path is exempt from the Basic gate and protected by the bearer token instead.
- **Failures** log a generic line (`cron publish failed: <error code>`) and a `system.error` activity entry with the code only. A test confirms the secret never appears in a response, the console, or the activity log even when the underlying error message contains it.
- **Observability:** the last successful run (time and number promoted) is stored and shown on Studio → System health, plus whether cron is configured at all.

## Setting it up (when approved)

1. Generate a secret on your own computer: `openssl rand -base64 48` (about 64 characters).
2. Add it as `CRON_SECRET` in hPanel's environment variables for the Node app and redeploy.
3. Pick **one** scheduler.

**A. Hostinger cron job** (hPanel → Advanced → Cron Jobs) every 5 minutes. Keep the secret out of the command line and out of process lists by reading it from a private file:
```bash
# one-time, over SSH or File Manager: store the secret in a file only your account can read
umask 077 && printf '%s' 'PASTE-THE-SECRET-HERE' > "$HOME/.fa-cron-token"

# the cron command (check the exact curl path your plan provides)
curl -fsS -m 30 -X POST -H "Authorization: Bearer $(cat $HOME/.fa-cron-token)" https://preview.foreignafrica.org/api/cron/publish
```

**B. External HTTP scheduler** (for example cron-job.org or an uptime service that can send a POST with a custom header). Configure: method `POST`, URL as above, header `Authorization: Bearer <secret>`, interval 5 minutes, expected status 200. Treat the secret as stored by that provider.

**C. Direct script** if Hostinger cron can run Node with the app's environment: `node server/promote-scheduled.js` (uses the database account directly; no token involved).

Rotate the secret by changing `CRON_SECRET`, redeploying, and updating the scheduler. Choose an interval you can live with: with layers 1 and 2 active, content is public on time regardless, so 5 to 15 minutes is ample.

## Verify first (cannot be tested from here)
- Hostinger Business offers Cron Jobs, the minimum interval, and which `curl`/`node` binaries cron sees (a cron shell may use a different Node than the app).
- Outbound HTTPS from cron to the preview hostname works, and the TLS certificate is valid (the endpoint refuses plain HTTP).
- The reverse proxy passes `X-Forwarded-Proto: https` (needed for the HTTPS check) and `X-Forwarded-For` (needed for per-client rate limits); `trust proxy` is set to one hop.
- Rate-limit counters being per process is acceptable if the host runs more than one instance.
