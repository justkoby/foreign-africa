# Security architecture

This describes the staff studio and `/api/staff`. The temporary file editor at `/editor` still uses the shared `CMS_PASSWORD` cookie `fa_editor`. It is separate from staff accounts and remains until that editor is retired.

## Accounts

- Passwords are hashed with `bcryptjs`. Cost 12, or cost 4 when `APP_ENV=test`.
- There is no default account and no password in the repository.
- `npm run bootstrap-admin` reads `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` from the environment, creates one super administrator, and refuses to run again once any account exists.
- The password must be at least 12 characters. The command does not print it.
- Email password reset is not implemented.

## Sessions

- Cookie name: `fa_staff`.
- HttpOnly, SameSite=Lax, Path=/.
- `Secure` is set when `APP_ENV` is `staging` or `production`, or when `COOKIE_SECURE=1`.
- The database stores `sha256(SESSION_SECRET:token)`, not the token.
- Sessions last 7 days. Logout and disabling an account set `revoked_at`.
- Each request loads the role from the database.

## Authorization

Permissions live in `server/permissions.js`.

| Action | Contributor | Editor | Administrator | Super administrator |
| --- | --- | --- | --- | --- |
| Create and edit own drafts | Yes | Yes | Yes | Yes |
| Edit any article | No | Yes | Yes | Yes |
| Publish, schedule, unpublish, archive | No | Yes | Yes | Yes |
| Delete | No | No | Yes | Yes |
| Manage users | No | No | Yes | Yes |
| Assign super administrator | No | No | No | Yes |
| Activity, health | No | No | Yes | Yes |
| Settings | No | No | No | Yes |

Hidden buttons are not the control. The API returns 403.

A person cannot disable their own account or remove the last super administrator.

## Other controls

- Mutating requests in staging and production must send an `Origin` that matches `PUBLIC_SITE_URL`. Test and development also allow a missing origin or the same host.
- Eight failures for one email, or 30 for one address, within 15 minutes returns 429. The counter is in `login_attempts`.
- Unknown email, wrong password, and disabled account return the same 401 text.
- Article HTML is built on the server from a whitelisted TipTap document. Client HTML is discarded. Image addresses must be `/images/...` or `/media/...` with no `..`. Links must be `http`, `https`, `mailto`, `/`, or `#`. A legacy `{text}` body is still accepted and converted to paragraphs.
- Queries use placeholders.
- 500 responses say “Something went wrong.” Database errors are not returned to the browser. Test mode includes the message so failures are visible in the suite.
- Activity metadata does not store passwords, cookies, or article bodies.
- Staging with `APP_ENV=staging` requires `STAGING_USER` and `STAGING_PASSWORD` or every response is 503. `server/index.js` exits if those values are missing.
- `GEMINI_API_KEY` is unchanged and still used only by the discovery handler.

## Uploads

- `POST /api/staff/media` requires a signed-in user with `content.create`.
- The type is taken from the file signature, not the extension. JPEG, PNG, WebP, GIF, and PDF are accepted. SVG and other types are rejected.
- Images are limited to 8 MB and PDFs to 15 MB.
- The stored name is random. The path must remain inside `MEDIA_ROOT`.
- Public delivery is `GET /media/:id` for a numeric id. `site:` records redirect to the existing public image path.
- Deleting a file that is the featured image, the social image, or named in an article body returns 409. Editors and above can delete an unreferenced file. Contributors cannot.
- If `MEDIA_ROOT` is empty, the upload route returns 503 and does not write a file.
- A failed upload is counted in health as `media.upload.failure`. The log does not store the file bytes.

`/editor` can no longer write news or commentaries. Those requests return 409. Events, people, engage, and forms still use the shared `CMS_PASSWORD`.

## Not done

Private submission files and email reset are later phases. The file editor’s shared password is still a single secret for the sections it still edits. Hostinger has not confirmed a persistent `MEDIA_ROOT`.
