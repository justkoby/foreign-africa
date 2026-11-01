// Starts a throwaway database and the real server with realistic sample data, and keeps running until stopped.
// Used to look at and screenshot the admin interface. Usage: [TEST_DB=mariadb] node scripts/ui-audit/serve.mjs <port>
import {createDisposableMysql} from '../../tests/helpers/mysql.js';
import {spawn} from 'node:child_process';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
const sharp = createRequire(new URL('../../package.json', import.meta.url))('sharp');
const port = Number(process.argv[2] || 4400);
const root = new URL('../..', import.meta.url).pathname;
const db = await createDisposableMysql();
const media = mkdtempSync(join(tmpdir(), 'fa-ui-media-'));
const base = `http://localhost:${port}`;
const env = {...process.env, PORT: String(port), APP_ENV: 'development', PUBLIC_SITE_URL: base, DB_HOST: '127.0.0.1', DB_PORT: String(db.port), DB_USER: 'root', DB_PASSWORD: '', DB_NAME: db.dbName, SESSION_SECRET: 'ui-audit-secret-ui-audit-secret', PREPARE_DATABASE: '1', PREPARE_DATABASE_CONFIRM: db.dbName, BOOTSTRAP_ADMIN_EMAIL: 'ada@foreignafrica.org', BOOTSTRAP_ADMIN_PASSWORD: 'correct-horse-battery', BOOTSTRAP_ADMIN_NAME: 'Ada Mensah', PASSWORD_COST: '4', MEDIA_ROOT: media, CRON_SECRET: 'c'.repeat(40)};
const srv = spawn('node', ['server/index.js'], {cwd: root, env, stdio: ['ignore', 'pipe', 'pipe']});
let log = ''; srv.stdout.on('data', d => { log += d; }); srv.stderr.on('data', d => { log += d; });
for (let i = 0; i < 160 && !log.includes('ready.'); i += 1) await new Promise(r => setTimeout(r, 250));
const login = await fetch(`${base}/api/staff/login`, {method: 'POST', headers: {'Content-Type': 'application/json', Origin: base}, body: JSON.stringify({email: 'ada@foreignafrica.org', password: 'correct-horse-battery'})});
const cookie = login.headers.get('set-cookie').split(';')[0];
const call = async (path, method = 'GET', body, ck = cookie) => { const r = await fetch(base + path, {method, headers: {'Content-Type': 'application/json', Origin: base, Cookie: ck}, body: body && JSON.stringify(body)}); return {status: r.status, data: await r.json().catch(() => ({}))}; };
// people in different roles
for (const [name, email, role] of [['Kofi Boateng', 'kofi@foreignafrica.org', 'editor'], ['Amara Osei', 'amara@foreignafrica.org', 'admin'], ['Naledi Dlamini', 'naledi@foreignafrica.org', 'contributor']]) await call('/api/staff/users', 'POST', {name, email, role, password: 'correct-horse-battery'});
const as = async email => (await fetch(`${base}/api/staff/login`, {method: 'POST', headers: {'Content-Type': 'application/json', Origin: base}, body: JSON.stringify({email, password: 'correct-horse-battery'})})).headers.get('set-cookie').split(';')[0];
const kofi = await as('kofi@foreignafrica.org'); const naledi = await as('naledi@foreignafrica.org');
// uploads with real metadata
const colours = ['#1d4ed8', '#0f766e', '#b45309', '#7c3aed', '#be123c', '#334155'];
for (const [i, c] of colours.entries()) {
  const png = await sharp({create: {width: 1200 + i * 60, height: 800, channels: 3, background: c}}).png().toBuffer();
  const form = new FormData(); form.append('file', new Blob([png], {type: 'image/png'}), `field-visit-${i + 1}.png`);
  await fetch(`${base}/api/staff/media`, {method: 'POST', headers: {Origin: base, Cookie: kofi}, body: form});
}
const media1 = (await call('/api/staff/media?type=image&sort=newest&pageSize=6', 'GET', undefined, kofi)).data.files;
const doc = text => ({type: 'doc', content: [{type: 'paragraph', content: [{type: 'text', text}]}]});
const now = Date.now();
const make = async (cookieOf, type, title, extra = {}, state) => {
  const r = await call('/api/staff/content', 'POST', {type, title, summary: extra.summary ?? `${title}: a short summary written for the card.`, document: doc(`${title}. Body text for the article.`), category: extra.category, tags: extra.tags, authorName: extra.author, featuredMediaId: extra.media, publishedAt: extra.publishedAt}, cookieOf);
  if (state && r.data.item) await call(`/api/staff/content/${r.data.item.id}/state`, 'POST', state, kofi);
  return r.data.item;
};
await make(kofi, 'news', 'Foreign Africa convenes enterprise leaders in Accra', {category: 'Convenings', media: media1[0]?.id, author: 'Kofi Boateng'}, {status: 'published'});
await make(kofi, 'news', 'Municipal diplomacy workshop opens registration', {category: 'Programmes', media: media1[1]?.id, author: 'Amara Osei'}, {status: 'published'});
await make(naledi, 'news', 'Draft: Trade corridors briefing notes', {category: 'Research', author: 'Naledi Dlamini'});
await make(naledi, 'news', 'Draft: Youth enterprise survey results', {category: 'Research', author: 'Naledi Dlamini'});
await make(kofi, 'news', 'Upcoming: Africa trade and jobs tracker launch', {category: 'Programmes', media: media1[2]?.id, author: 'Kofi Boateng'}, {status: 'scheduled', publishedAt: new Date(now + 3 * 864e5).toISOString()});
await make(kofi, 'news', 'Intern cohort completion ceremony recap', {category: 'Community', media: media1[3]?.id, author: 'Amara Osei'}, {status: 'archived'});
await make(kofi, 'commentary', 'Why trade corridors matter for African jobs', {category: 'Trade', media: media1[4]?.id, author: 'Kofi Boateng', tags: ['trade', 'jobs']}, {status: 'published'});
await make(kofi, 'page', 'Careers at Foreign Africa', {author: 'Amara Osei'}, {status: 'published'});
writeFileSync(join(root, 'scripts/ui-audit/.port'), String(port));
console.log(`READY ${base}  admin: ada@foreignafrica.org / correct-horse-battery`);
process.on('SIGTERM', async () => { srv.kill(); await db.stop(); process.exit(0); });
process.on('SIGINT', async () => { srv.kill(); await db.stop(); process.exit(0); });
await new Promise(() => {});
