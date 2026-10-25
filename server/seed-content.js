import {existsSync, readFileSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import commentaries from '../data/cms/commentaries.json' with {type: 'json'};
import news from '../data/cms/news.json' with {type: 'json'};
import {activities} from '../src/activities.js';
import {importContent} from './content-store.js';
import {editorialDocument, plainDocument} from './document.js';
import {registerSiteFile} from './media.js';
import {createPool} from './db.js';
import {databaseConfigured, readConfig} from './config.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const localNews = {7277: 'continental-mission-follow-up', 6164: 'johannesburg-convening'};

function slugFrom(url) {
  return new URL(url).pathname.split('/').filter(Boolean).at(-1) || '';
}

function imageSources(document) {
  const paths = [];
  const walk = node => {
    if (node?.type === 'image' && node.attrs?.src) paths.push(node.attrs.src);
    for (const child of node?.content ?? []) walk(child);
  };
  walk(document);
  return paths;
}

async function remember(pool, clock, actorId, paths) {
  const ids = new Map();
  for (const path of new Set(paths.filter(Boolean))) ids.set(path, await registerSiteFile({pool, clock, actorId, publicPath: path}));
  return ids;
}

export async function seedCatalogue({pool, clock, actor, directory = root}) {
  const report = {inserted: [], existing: [], blocked: []};
  const articles = commentaries.filter(item => item.status !== 'draft');
  for (const [index, item] of articles.entries()) {
    const file = join(directory, 'public', 'content', 'commentaries', `${item.id}.json`);
    if (!existsSync(file)) {
      report.blocked.push({id: item.id, title: item.title, reason: 'The article body file is not in the repository.'});
      continue;
    }
    const source = JSON.parse(readFileSync(file, 'utf8'));
    const document = editorialDocument(source.content, articles);
    const images = await remember(pool, clock, actor.id, [item.image, ...imageSources(document)]);
    const result = await importContent({pool, clock, actor, input: {
      type: 'commentary', title: item.title, slug: item.slug, summary: item.summary, document,
      authorName: item.authors.join(' · '), category: item.topic, tags: item.tags, location: '',
      featured: index === 0, featuredMediaId: images.get(item.image) || null, imageFit: 'cover',
      publishedAt: `${item.date}T12:00:00.000Z`, status: 'published', legacyId: item.id, sourceUrl: item.sourceUrl,
      seoDescription: item.summary,
    }});
    report[result.status === 'inserted' ? 'inserted' : 'existing'].push({type: 'commentary', id: item.id, slug: item.slug});
  }
  for (const item of news.filter(entry => entry.status !== 'draft')) {
    const story = activities.find(entry => entry.id === localNews[item.id]);
    const complete = Boolean(story?.paragraphs?.length);
    if (!complete && !item.url.startsWith('https://foreignafrica.org/')) {
      report.blocked.push({id: item.id, title: item.title, reason: 'No local article body and no Foreign Africa source URL.'});
      continue;
    }
    const document = complete ? plainDocument(story.paragraphs.join('\n\n')) : plainDocument('');
    const images = item.image ? await remember(pool, clock, actor.id, [item.image]) : new Map();
    const result = await importContent({pool, clock, actor, input: {
      type: 'news', title: item.title, slug: slugFrom(item.sourceUrl), summary: item.summary, document,
      authorName: 'Foreign Africa', category: item.category, tags: [], location: item.location || '',
      featured: item.id === '7277', featuredMediaId: images.get(item.image) || null, imageFit: item.imageFit || 'cover',
      publishedAt: `${item.publishedOn}T12:00:00.000Z`, status: 'published', legacyId: item.id, sourceUrl: item.sourceUrl,
      externalUrl: complete ? '' : item.url, seoDescription: item.summary,
    }});
    report[result.status === 'inserted' ? 'inserted' : 'existing'].push({type: 'news', id: item.id, slug: slugFrom(item.sourceUrl), complete});
  }
  return report;
}

async function seedCli() {
  const config = readConfig();
  if (!databaseConfigured(config)) {
    console.error('Set DB_HOST, DB_USER, and DB_NAME before seeding.');
    process.exit(1);
  }
  const pool = createPool(config);
  try {
    const [users] = await pool.execute("SELECT users.id, users.email FROM users JOIN user_roles ON user_roles.user_id = users.id JOIN roles ON roles.id = user_roles.role_id WHERE roles.role_key = 'super_admin' AND users.deleted_at IS NULL ORDER BY users.id LIMIT 1");
    if (!users[0]) {
      console.error('Create the first administrator with npm run bootstrap-admin before seeding.');
      process.exit(1);
    }
    const report = await seedCatalogue({pool, clock: () => Date.now(), actor: {id: users[0].id, roles: ['super_admin']}});
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  seedCli().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
