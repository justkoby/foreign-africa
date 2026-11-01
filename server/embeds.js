// Approved video sources. Pure and dependency-free so the browser editor and the server share one rule.
// Only an 11-character YouTube id is ever stored; the embed address is rebuilt from it, never copied from input.
const hosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com', 'youtu.be']);
const idPattern = /^[A-Za-z0-9_-]{11}$/;

export function youtubeId(raw) {
  const text = String(raw ?? '').trim();
  if (!text || text.length > 300) return '';
  let url;
  try { url = new URL(text); } catch { return ''; }
  if (!['https:', 'http:'].includes(url.protocol) || !hosts.has(url.hostname.toLowerCase()) || url.username || url.password) return '';
  let id = '';
  if (url.hostname.toLowerCase() === 'youtu.be') id = url.pathname.split('/')[1] ?? '';
  else if (url.pathname === '/watch') id = url.searchParams.get('v') ?? '';
  else {
    const [, kind, value] = url.pathname.split('/');
    if (['embed', 'shorts', 'live', 'v'].includes(kind)) id = value ?? '';
  }
  return idPattern.test(id) ? id : '';
}

export const isYoutubeId = value => idPattern.test(String(value ?? ''));
export const youtubeEmbedSrc = id => `https://www.youtube-nocookie.com/embed/${id}`;
export const youtubeThumbnail = id => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
