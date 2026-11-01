import {fail} from './errors.js';
import {slugify, sqlTime} from './text.js';

export const vocabularies = ['category', 'tag'];

async function audit(pool, clock, actor, action, id, metadata = {}) {
  await pool.execute('INSERT INTO activity_logs (actor_id, action, subject_type, subject_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)', [actor.id, action, 'term', String(id), JSON.stringify(metadata), sqlTime(clock())]);
}

function present(row) {
  return {id: Number(row.id), vocabulary: row.vocabulary, name: row.name, slug: row.slug, uses: Number(row.uses ?? 0)};
}

export async function listTerms(pool, {vocabulary, q}) {
  if (vocabulary && !vocabularies.includes(vocabulary)) throw fail(400, 'Unknown vocabulary.');
  const where = [];
  const params = [];
  if (vocabulary) { where.push('t.vocabulary = ?'); params.push(vocabulary); }
  if (q) { where.push("t.name LIKE ? ESCAPE '!'"); params.push(`%${String(q).slice(0, 80).replace(/[!%_]/g, m => `!${m}`)}%`); }
  const [rows] = await pool.execute(`SELECT t.id, t.vocabulary, t.name, t.slug, COUNT(c.id) AS uses FROM terms t LEFT JOIN content_terms ct ON ct.term_id = t.id LEFT JOIN content_items c ON c.id = ct.content_id AND c.deleted_at IS NULL${where.length ? ` WHERE ${where.join(' AND ')}` : ''} GROUP BY t.id, t.vocabulary, t.name, t.slug ORDER BY t.name ASC LIMIT 500`, params);
  return rows.map(present);
}

function cleanName(value) {
  const name = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!name || name.length > 160) throw fail(400, 'Enter a name of up to 160 characters.');
  return name;
}

function cleanSlug(value, name) {
  const slug = slugify(value || name);
  if (!slug) throw fail(400, 'Use letters or numbers in the name.');
  return slug.slice(0, 160);
}

async function one(pool, id) {
  const [rows] = await pool.execute('SELECT t.id, t.vocabulary, t.name, t.slug, (SELECT COUNT(*) FROM content_terms ct JOIN content_items c ON c.id = ct.content_id AND c.deleted_at IS NULL WHERE ct.term_id = t.id) AS uses FROM terms t WHERE t.id = ?', [id]);
  if (!rows[0]) throw fail(404, 'That term was not found.');
  return present(rows[0]);
}

export async function createTerm({pool, clock, actor, input}) {
  if (!vocabularies.includes(input.vocabulary)) throw fail(400, 'Choose categories or tags.');
  const name = cleanName(input.name);
  try {
    const [result] = await pool.execute('INSERT INTO terms (vocabulary, name, slug) VALUES (?, ?, ?)', [input.vocabulary, name, cleanSlug(input.slug, name)]);
    await audit(pool, clock, actor, 'term.created', result.insertId, {vocabulary: input.vocabulary});
    return one(pool, result.insertId);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw fail(409, 'That name or slug already exists.');
    throw error;
  }
}

export async function updateTerm({pool, clock, actor, id, input}) {
  const current = await one(pool, id);
  const name = input.name === undefined ? current.name : cleanName(input.name);
  const slug = input.slug === undefined ? current.slug : cleanSlug(input.slug, name);
  try {
    await pool.execute('UPDATE terms SET name = ?, slug = ? WHERE id = ?', [name, slug, id]);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw fail(409, 'That name or slug already exists.');
    throw error;
  }
  await audit(pool, clock, actor, 'term.updated', id);
  return one(pool, id);
}

// Deleting a term that is in use needs an explicit choice: merge its items into another term, or detach it.
export async function deleteTerm({pool, clock, actor, id, mergeInto, detach}) {
  const current = await one(pool, id);
  let target = null;
  if (mergeInto) {
    target = await one(pool, Number(mergeInto));
    if (target.id === current.id || target.vocabulary !== current.vocabulary) throw fail(400, 'Choose a different term of the same kind to merge into.');
  } else if (current.uses > 0 && !detach) {
    throw fail(409, `This term is used by ${current.uses} item${current.uses === 1 ? '' : 's'}. Merge it into another term, or choose to remove it from them.`);
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (target) await connection.execute('INSERT IGNORE INTO content_terms (content_id, term_id) SELECT content_id, ? FROM content_terms WHERE term_id = ?', [target.id, id]);
    await connection.execute('DELETE FROM content_terms WHERE term_id = ?', [id]);
    await connection.execute('DELETE FROM terms WHERE id = ?', [id]);
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
  await audit(pool, clock, actor, target ? 'term.merged' : 'term.deleted', id, {vocabulary: current.vocabulary, uses: current.uses, ...(target ? {into: target.id} : {})});
}
