// Runs after `vite build`: records which source the compiled site in dist/ was built from.
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceHash} from '../server/build-stamp.js';

const root = fileURLToPath(new URL('..', import.meta.url));
writeFileSync(join(root, 'dist', 'build-stamp.json'), JSON.stringify({sourceHash: sourceHash(root), builtAt: new Date().toISOString()}) + '\n');
console.log('Wrote dist/build-stamp.json');
