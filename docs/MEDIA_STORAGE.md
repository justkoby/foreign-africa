# Media storage

## Where files go

`MEDIA_ROOT` is an absolute directory. Uploaded files are stored at `MEDIA_ROOT/files/{random-name}.{ext}`. Thumbnails, when sharp can make one, are `MEDIA_ROOT/thumbs/{same-name}.webp`.

Do not set `MEDIA_ROOT` inside `hbuilds/`, `public_html/`, or the Vite `dist/` folder. Those directories are replaced on deploy.

If `MEDIA_ROOT` is empty, `POST /api/staff/media` returns 503. The library lists nothing new. This is the current state of local `.env.local`, and Hostinger has not confirmed a surviving directory. Uploads are therefore off until that path is chosen and checked by writing a file there and redeploying.

## What an upload accepts

The server reads the file signature. The extension is not trusted.

| Signature | Stored as | Limit |
| --- | --- | --- |
| JPEG | `.jpg`, re-encoded when sharp is available | 8 MB |
| PNG | `.png` | 8 MB |
| WebP | `.webp` | 8 MB |
| GIF | `.gif`, stored as uploaded, no thumbnail | 8 MB |
| PDF | `.pdf` | 15 MB |

SVG and every other type are rejected. A file over the limit is rejected. The stored name is random. `..` in a name cannot leave `MEDIA_ROOT`.

sharp resizes JPEG, PNG, and WebP to a maximum width of 2000 pixels and writes a 480-pixel WebP thumbnail. If sharp fails, the original bytes are kept and there is no thumbnail. GIF is not re-encoded.

`GET /media/:id` serves a public uploaded file with `Cache-Control: public, max-age=31536000, immutable` and `X-Content-Type-Options: nosniff`. The id must be numeric. The resolved path must stay inside `MEDIA_ROOT`.

## Existing site images

`public/images/` is not deleted and is not copied into `MEDIA_ROOT`. `npm run seed-content` inserts a `media_assets` row whose `storage_path` is `site:/images/...`. Opening that id redirects to the existing public path.

The same registration is available to the studio when an editor selects an image that already lives under `/images/`.

## Who can change files

Uploading requires a staff session and `content.create`. Changing alt text uses the same session. Deleting requires `content.update.any`, so contributors cannot delete. A file used as a featured image, a social image, or inside an article body returns 409 and is kept.

## Not verified on Hostinger

No file has been uploaded to a Hostinger disk. The upload, reject, and referenced-delete checks in `tests/phase2-mysql.test.js` used a temporary directory on this machine.
