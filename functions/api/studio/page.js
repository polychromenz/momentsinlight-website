// Your website's pages (not blog posts), for the page editor (/studio/page-edit):
// src/data/pages/<id>.json, and the home page's src/data/home.json.
//   GET /api/studio/page?id=abel-estate | home   -> { sha, data }
//   PUT /api/studio/page { id, data, sha, message } -> { sha }
import { json, readRepoFile, writeRepoFile } from '../../../functions-lib/studio.js';

const fileOf = (id) => (id === 'home' ? 'src/data/home.json' : /^[a-z0-9][a-z0-9-]{0,100}$/.test(id ?? '') ? `src/data/pages/${id}.json` : null);
const indentOf = (text) => text.match(/\n( +)"/)?.[1].length ?? 2;

export async function onRequestGet({ request, env }) {
  const file = fileOf(new URL(request.url).searchParams.get('id'));
  if (!file) return json({ error: 'Which page?' }, 400);
  try {
    const r = await readRepoFile(env, file);
    if (!r.exists) return json({ error: 'That page wasn’t found.' }, 404);
    return json({ sha: r.sha, data: JSON.parse(r.content) });
  } catch (e) {
    return json({ error: `Couldn’t open the page (${e.message}).` }, 502);
  }
}

export async function onRequestPut({ request, env }) {
  const { id, data, sha, message } = await request.json().catch(() => ({}));
  const file = fileOf(id);
  if (!file || !data || typeof data !== 'object') return json({ error: 'Nothing to save.' }, 400);
  const cur = await readRepoFile(env, file).catch(() => ({ exists: false }));
  if (!cur.exists) return json({ error: 'That page wasn’t found.' }, 404);
  const old = JSON.parse(cur.content);
  // Guard rails: the page keeps its address and its structure.
  if (id === 'home') {
    if (!['title', 'description', 'h1'].every((k) => typeof data[k] === 'string' && data[k].trim())) return json({ error: 'The home page needs a title, description and heading.' }, 400);
  } else {
    if (data.path !== old.path) return json({ error: 'A page’s address can’t change here.' }, 400);
    if (!Array.isArray(data.sections) || typeof data.title !== 'string' || !data.title.trim()) return json({ error: 'The page needs a Google title.' }, 400);
  }
  const content = JSON.stringify(data, null, indentOf(cur.content)) + '\n';
  const r = await writeRepoFile(env, file, content, sha, message || `Studio: update page ${old.path ?? '/'}`);
  if (r.status === 409 || r.status === 422) return json({ error: 'This page was changed somewhere else since you opened it (perhaps a fix from the SEO pages). Reload to get the latest version.', conflict: true }, 409);
  if (!r.ok) return json({ error: `Couldn’t save (GitHub ${r.status}: ${r.data?.message ?? ''}).` }, 502);
  return json({ sha: r.data.content.sha });
}
