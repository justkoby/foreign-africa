import {randomBytes} from 'node:crypto';
import {createReadStream, existsSync} from 'node:fs';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {basename, join, resolve, sep} from 'node:path';
import Busboy from 'busboy';
import {fail} from './errors.js';
import {sqlTime} from './text.js';

const imageLimit = 8 * 1024 * 1024;
const pdfLimit = 15 * 1024 * 1024;

export function sniff(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return {mime: 'image/jpeg', ext: 'jpg', kind: 'image'};
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG') return {mime: 'image/png', ext: 'png', kind: 'image'};
  if (buffer.length >= 6 && (buffer.toString('ascii', 0, 6) === 'GIF87a' || buffer.toString('ascii', 0, 6) === 'GIF89a')) return {mime: 'image/gif', ext: 'gif', kind: 'image'};
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return {mime: 'image/webp', ext: 'webp', kind: 'image'};
  if (buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-') return {mime: 'application/pdf', ext: 'pdf', kind: 'pdf'};
  return null;
}

export function imageSize(buffer, ext) {
  try {
    if (ext === 'png' && buffer.length >= 24) return {width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20)};
    if (ext === 'gif' && buffer.length >= 10) return {width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8)};
    if (ext === 'webp' && buffer.toString('ascii', 12, 16) === 'VP8X' && buffer.length >= 30) return {width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3)};
    if (ext === 'jpg') {
      let offset = 2;
      while (offset + 8 < buffer.length) {
        if (buffer[offset] !== 0xff) break;
        const marker = buffer[offset + 1];
        if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
        const length = buffer.readUInt16BE(offset + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return {height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7)};
        offset += 2 + length;
      }
    }
  } catch { /* Dimensions are optional when a file header is unusual. */ }
  return {width: null, height: null};
}

export function mediaUrl(id, storagePath) {
  if (!storagePath) return '';
  if (String(storagePath).startsWith('site:')) return String(storagePath).slice(5);
  return id ? `/media/${Number(id)}` : '';
}

export function mediaRootProblem(root) {
  if (!root) return 'MEDIA_ROOT is not set. Uploads are not enabled.';
  const normalized = String(root).replaceAll('\\', '/');
  if (/(^|\/)(hbuilds|public_html|dist)(\/|$)/.test(normalized)) return 'MEDIA_ROOT is inside a deployment directory. Uploads stay off until it is moved outside hbuilds, public_html, and dist.';
  return '';
}

export function insideRoot(root, relative) {
  const base = resolve(root);
  const full = resolve(base, relative);
  if (full !== base && !full.startsWith(base + sep)) return '';
  return full;
}

function safeOriginalName(name) {
  return basename(String(name || 'file')).replace(/[^\w. -]+/g, '').slice(0, 180) || 'file';
}

async function prepared(buffer, kind, ext) {
  if (kind !== 'image' || ext === 'gif') return {buffer, thumb: null};
  try {
    const sharp = (await import('sharp')).default;
    const image = sharp(buffer, {failOn: 'error'}).rotate();
    const main = ext === 'png' ? image.clone().resize({width: 2000, withoutEnlargement: true}).png() : image.clone().resize({width: 2000, withoutEnlargement: true}).jpeg({quality: 82, mozjpeg: true});
    const output = ext === 'webp' ? image.clone().resize({width: 2000, withoutEnlargement: true}).webp({quality: 80}) : main;
    const thumb = await image.clone().resize({width: 480, withoutEnlargement: true}).webp({quality: 75}).toBuffer();
    return {buffer: await output.toBuffer(), thumb};
  } catch {
    return {buffer, thumb: null};
  }
}

export function readUpload(req) {
  return new Promise((resolveUpload, reject) => {
    if (!String(req.headers['content-type'] || '').includes('multipart/form-data')) {
      reject(fail(400, 'Choose a file to upload.'));
      return;
    }
    const busboy = Busboy({headers: req.headers, limits: {files: 1, fileSize: pdfLimit, fields: 4, fieldSize: 1000}});
    const chunks = [];
    let file = null;
    let failed = null;
    busboy.on('file', (_name, stream, info) => {
      file = {filename: info.filename, mime: info.mimeType};
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('limit', () => { failed = fail(413, 'That file is too large.'); });
    });
    busboy.on('error', () => reject(fail(400, 'The upload could not be read.')));
    busboy.on('finish', () => {
      if (failed) reject(failed);
      else if (!file) reject(fail(400, 'Choose a file to upload.'));
      else resolveUpload({filename: file.filename, buffer: Buffer.concat(chunks)});
    });
    req.pipe(busboy);
  });
}

export async function saveUpload({pool, config, clock, actor, upload}) {
  const blocked = mediaRootProblem(config.mediaRoot);
  if (blocked) throw fail(503, blocked);
  const sniffed = sniff(upload.buffer);
  if (!sniffed) throw fail(400, 'Upload a JPEG, PNG, WebP, GIF, or PDF. Other file types are not accepted.');
  const limit = sniffed.kind === 'pdf' ? pdfLimit : imageLimit;
  if (upload.buffer.length > limit) throw fail(413, 'That file is too large.');
  const name = `${randomBytes(16).toString('hex')}.${sniffed.ext === 'jpg' && sniffed.kind === 'image' ? 'jpg' : sniffed.ext}`;
  const relative = join('files', name);
  const full = insideRoot(config.mediaRoot, relative);
  if (!full) throw fail(400, 'The file could not be stored.');
  const optimised = await prepared(upload.buffer, sniffed.kind, sniffed.ext);
  const storedExt = sniffed.ext === 'png' || sniffed.ext === 'webp' || sniffed.ext === 'gif' || sniffed.ext === 'pdf' ? sniffed.ext : 'jpg';
  const finalName = `${name.slice(0, name.lastIndexOf('.'))}.${storedExt}`;
  const finalRelative = join('files', finalName).replaceAll('\\', '/');
  const finalFull = insideRoot(config.mediaRoot, finalRelative);
  await mkdir(join(config.mediaRoot, 'files'), {recursive: true});
  await writeFile(finalFull, optimised.buffer);
  let thumbPath = null;
  if (optimised.thumb) {
    const thumbName = `${finalName.slice(0, finalName.lastIndexOf('.'))}.webp`;
    thumbPath = join('thumbs', thumbName).replaceAll('\\', '/');
    await mkdir(join(config.mediaRoot, 'thumbs'), {recursive: true});
    await writeFile(insideRoot(config.mediaRoot, thumbPath), optimised.thumb);
  }
  const size = imageSize(optimised.buffer, storedExt === 'jpg' ? 'jpg' : storedExt);
  const now = sqlTime(clock());
  const [result] = await pool.execute(
    'INSERT INTO media_assets (storage_path, mime_type, original_name, byte_size, width, height, thumb_path, alt_text, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [finalRelative, sniffed.mime === 'image/jpeg' && storedExt === 'jpg' ? 'image/jpeg' : sniffed.mime, safeOriginalName(upload.filename), optimised.buffer.length, size.width, size.height, thumbPath, '', actor.id, now],
  );
  return presentMedia({id: result.insertId, storage_path: finalRelative, mime_type: sniffed.mime, original_name: safeOriginalName(upload.filename), byte_size: optimised.buffer.length, width: size.width, height: size.height, thumb_path: thumbPath, alt_text: '', created_at: now});
}

export function presentMedia(row) {
  const id = Number(row.id);
  return {
    id,
    name: row.original_name || 'file',
    mime: row.mime_type,
    bytes: Number(row.byte_size),
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    alt: row.alt_text || '',
    url: mediaUrl(id, row.storage_path),
    thumb: row.thumb_path ? `/media/${id}/thumb` : mediaUrl(id, row.storage_path),
    createdAt: row.created_at,
  };
}

export async function listMedia(pool, query) {
  const where = ['deleted_at IS NULL'];
  const params = [];
  if (query) {
    where.push("(original_name LIKE ? ESCAPE '\\\\' OR alt_text LIKE ? ESCAPE '\\\\')");
    const like = `%${String(query).replace(/[\\%_]/g, match => `\\${match}`)}%`;
    params.push(like, like);
  }
  const [rows] = await pool.execute(`SELECT id, storage_path, mime_type, original_name, byte_size, width, height, thumb_path, alt_text, created_at FROM media_assets WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT 60`, params);
  return rows.map(presentMedia);
}

export async function updateMediaAlt({pool, id, alt}) {
  const text = String(alt ?? '').slice(0, 300);
  const [result] = await pool.execute('UPDATE media_assets SET alt_text = ? WHERE id = ? AND deleted_at IS NULL', [text, id]);
  if (!result.affectedRows) throw fail(404, 'That file was not found.');
  const [rows] = await pool.execute('SELECT * FROM media_assets WHERE id = ?', [id]);
  return presentMedia(rows[0]);
}

export async function mediaInUse(pool, id, storagePath) {
  const publicPath = mediaUrl(id, storagePath);
  const marker = `${publicPath}"`;
  const [rows] = await pool.execute(
    'SELECT id FROM content_items WHERE deleted_at IS NULL AND (featured_media_id = ? OR social_image_id = ? OR body_html LIKE ? OR CAST(body_json AS CHAR) LIKE ?) LIMIT 1',
    [id, id, `%${marker}%`, `%${marker}%`],
  );
  return Boolean(rows[0]);
}

export async function removeMedia({pool, config, clock, id}) {
  const [rows] = await pool.execute('SELECT * FROM media_assets WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!rows[0]) throw fail(404, 'That file was not found.');
  if (await mediaInUse(pool, id, rows[0].storage_path)) throw fail(409, 'That file is still used by an article. Remove it from the article first.');
  if (!String(rows[0].storage_path).startsWith('site:') && config.mediaRoot) {
    const full = insideRoot(config.mediaRoot, rows[0].storage_path);
    const thumb = rows[0].thumb_path ? insideRoot(config.mediaRoot, rows[0].thumb_path) : '';
    if (full) await rm(full, {force: true});
    if (thumb) await rm(thumb, {force: true});
  }
  await pool.execute('UPDATE media_assets SET deleted_at = ? WHERE id = ?', [sqlTime(clock()), id]);
}

export async function openMedia(pool, config, id, thumb) {
  const [rows] = await pool.execute('SELECT * FROM media_assets WHERE id = ? AND deleted_at IS NULL', [id]);
  const row = rows[0];
  if (!row) return null;
  if (String(row.storage_path).startsWith('site:')) return {redirect: mediaUrl(id, row.storage_path)};
  const relative = thumb && row.thumb_path ? row.thumb_path : row.storage_path;
  const full = config.mediaRoot ? insideRoot(config.mediaRoot, relative) : '';
  if (!full || !existsSync(full)) return null;
  return {path: full, mime: thumb && row.thumb_path ? 'image/webp' : row.mime_type, stream: createReadStream(full)};
}

export async function registerSiteFile({pool, clock, actorId, publicPath, alt = ''}) {
  if (!publicPath.startsWith('/images/') || publicPath.includes('..')) throw fail(400, 'Existing images must stay under /images/.');
  const storage = `site:${publicPath}`;
  const [existing] = await pool.execute('SELECT id FROM media_assets WHERE storage_path = ? AND deleted_at IS NULL', [storage]);
  if (existing[0]) return Number(existing[0].id);
  const [result] = await pool.execute(
    'INSERT INTO media_assets (storage_path, mime_type, original_name, byte_size, alt_text, created_by, created_at) VALUES (?, ?, ?, 0, ?, ?, ?)',
    [storage, 'application/octet-stream', basename(publicPath), String(alt).slice(0, 300), actorId, sqlTime(clock())],
  );
  return Number(result.insertId);
}

export async function readStored(config, relative) {
  const full = insideRoot(config.mediaRoot, relative);
  if (!full) return null;
  return readFile(full);
}
