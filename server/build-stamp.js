import {createHash} from 'node:crypto';
import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';

// A fingerprint of the frontend source. `npm run build` stores it in dist/build-stamp.json; the server recomputes it at
// start-up. If they differ, the website files in dist/ were built from different source than the one now deployed, which
// happens when dist/ is committed and the host's own build step did not run. Only src/, index.html and vite.config.js
// matter to the compiled site, so only those are hashed.
function files(directory, root, out = []) {
  for (const name of readdirSync(directory).sort()) {
    const full = join(directory, name);
    if (statSync(full).isDirectory()) files(full, root, out);
    else out.push(relative(root, full).replaceAll('\\', '/'));
  }
  return out;
}

export function sourceHash(root) {
  const hash = createHash('sha256');
  const list = [...(existsSync(join(root, 'src')) ? files(join(root, 'src'), root) : []), 'index.html', 'vite.config.js'].filter(name => existsSync(join(root, name)));
  for (const name of list) hash.update(`${name}\0`).update(readFileSync(join(root, name))).update('\0');
  return hash.digest('hex');
}

// 'fresh' | 'stale' | 'unknown' (no stamp, or no source to compare with)
export function buildFreshness(root) {
  const stampFile = join(root, 'dist', 'build-stamp.json');
  if (!existsSync(stampFile) || !existsSync(join(root, 'src'))) return 'unknown';
  try { return JSON.parse(readFileSync(stampFile, 'utf8')).sourceHash === sourceHash(root) ? 'fresh' : 'stale'; } catch { return 'unknown'; }
}
