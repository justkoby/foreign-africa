import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';

export function sqlTime(ms) {
  return new Date(ms).toISOString().slice(0, 23).replace('T', ' ');
}

export function slugify(value) {
  return String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 180);
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
}

export function bodyHtml(text) {
  return String(text ?? '').split(/\n{2,}/).map(paragraph => paragraph.trim()).filter(Boolean)
    .map(paragraph => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`).join('');
}

export function newToken() {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token, secret) {
  return createHash('sha256').update(`${secret}:${token}`).digest('hex');
}

export function hashIp(ip, secret) {
  return createHash('sha256').update(`${secret}:ip:${ip || ''}`).digest('hex');
}

export function readCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

export function sameSecret(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function originAllowed(origin, config, host) {
  if (!origin) return config.appEnv === 'development' || config.appEnv === 'test';
  try {
    const url = new URL(origin);
    const site = new URL(config.publicSiteUrl);
    if (url.origin === site.origin) return true;
    if ((config.appEnv === 'development' || config.appEnv === 'test') && host && url.host === host) return true;
  } catch {
    return false;
  }
  return false;
}

export function stagingCanonicalBlocked(config) {
  if (config.appEnv !== 'staging') return false;
  try {
    return new URL(config.publicSiteUrl).hostname === 'foreignafrica.org' || new URL(config.publicSiteUrl).hostname === 'www.foreignafrica.org';
  } catch {
    return true;
  }
}
