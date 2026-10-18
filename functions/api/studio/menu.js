// The website's main menu (src/data/menu.json), for the menu editor (/studio/menu).
//   GET /api/studio/menu                      -> { sha, data }
//   PUT /api/studio/menu { data, sha }        -> { sha }
import { json, readRepoFile, writeRepoFile } from '../../../functions-lib/studio.js';

const FILE = 'src/data/menu.json';
const okLink = (h) => typeof h === 'string' && (/^\/[a-z0-9\-/#?=&.]*$/i.test(h) || /^https:\/\//.test(h));

export async function onRequestGet({ env }) {
  const r = await readRepoFile(env, FILE);
  if (!r.exists) return json({ error: 'The menu file is missing.' }, 404);
  return json({ sha: r.sha, data: JSON.parse(r.content) });
}

export async function onRequestPut({ request, env }) {
  const { data, sha } = await request.json().catch(() => ({}));
  const items = data?.items;
  if (!Array.isArray(items) || !items.length) return json({ error: 'The menu needs at least one item.' }, 400);
  const clean = (i) => ({ label: String(i.label ?? '').trim().slice(0, 60), href: String(i.href ?? '').trim() });
  const out = [];
  for (const i of items) {
    const item = clean(i);
    const kids = Array.isArray(i.children) ? i.children.map(clean) : [];
    if (!item.label) return json({ error: 'Every menu item needs a name.' }, 400);
    if (kids.some((k) => !k.label || !okLink(k.href))) return json({ error: `Check the links under “${item.label}”: each needs a name and a page.` }, 400);
    if (!kids.length && !okLink(item.href)) return json({ error: `“${item.label}” needs a page to link to.` }, 400);
    // A dropdown's own address isn't a page; keep one so the menu still works without scripts.
    if (kids.length && !item.href) item.href = `/${item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-menu`;
    out.push(kids.length ? { ...item, children: kids } : item);
  }
  const r = await writeRepoFile(env, FILE, JSON.stringify({ ...data, items: out }, null, 2) + '\n', sha, 'Studio: update the menu');
  if (r.status === 409 || r.status === 422) return json({ error: 'The menu was changed somewhere else since you opened it (perhaps by adding a page). Reload to get the latest.', conflict: true }, 409);
  if (!r.ok) return json({ error: `Couldn’t save (GitHub ${r.status}: ${r.data?.message ?? ''}).` }, 502);
  return json({ sha: r.data.content.sha });
}
