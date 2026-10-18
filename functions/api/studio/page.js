// Your website's pages (not blog posts), for the page editor (/studio/page-edit):
// src/data/pages/<id>.json, and the home page's src/data/home.json.
//   GET /api/studio/page?id=abel-estate | home   -> { sha, data }
//   PUT /api/studio/page { id, data, sha, message } -> { sha }
//   POST /api/studio/page { name, slug, menu? }   a new page (refreshed design), optionally added to
//                                                 the menu under the dropdown called `menu` (or 'top')
import { json, readRepoFile, writeRepoFile, commitFiles } from '../../../functions-lib/studio.js';

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

// Addresses that are taken: built-in pages and folders (and the blog).
const RESERVED = ['weddings', 'west-auckland-wedding-venues', 'wedding-galleries', 'contact', 'blog', 'api', 's', 'images', '_astro', 'studio', 'portal', 'invoice', 'quote', 'contract', 'questionnaire', 'thanks', 'newcontact', 'fonts', 'sitemap-index.xml', 'robots.txt'];
const rid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 24);

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => ({}));
  const name = String(d.name ?? '').trim().slice(0, 80);
  const slug = String(d.slug ?? '').trim().toLowerCase();
  if (!name) return json({ error: 'What’s the page called?' }, 400);
  if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(slug)) return json({ error: 'The address can only use small letters, numbers and dashes.' }, 400);
  if (RESERVED.includes(slug)) return json({ error: `/${slug} is already a page on your site. Choose a different address.` }, 400);
  const file = `src/data/pages/${slug}.json`;
  if ((await readRepoFile(env, file)).exists) return json({ error: `/${slug} is already a page. Choose a different address.` }, 400);
  const redirects = await readRepoFile(env, 'public/_redirects');
  if (redirects.exists && redirects.content.split(/\r?\n/).some((l) => l.trim().split(/\s+/)[0] === `/${slug}`)) return json({ error: `/${slug} is an old address that redirects elsewhere. Choose a different one.` }, 400);
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Laid out like the other pages; the refresh options give it the refreshed design.
  const area = { m: '1/2/7/10', zm: 1, d: '1/2/19/26', zd: 1 }, valign = { m: 'flex-start', d: 'flex-start' };
  const page = {
    path: `/${slug}`,
    title: `${name} | Moments In Light`,
    description: '',
    ogImage: '',
    type: {},
    refresh: {},
    sections: [{
      id: rid(), kind: 'fluid', bg: 'rgb(255, 255, 255)', bgImage: null, bgOverlay: null, headingColor: 'rgb(90, 94, 59)', textColor: 'rgb(0, 0, 0)', divider: null,
      pad: { d: [1.4, 1.4], m: [0.9, 0.9] }, height: { d: 900, m: 900 }, grid: { mRows: 2, mRowMin: 24, dRows: 18, dScale: 0.0215, mGap: 11, dGap: 11 },
      blocks: [{ id: rid(), type: 'text', html: `<h1>${esc(name)}</h1><p>Write the opening words here.</p>`, area, valign }],
    }],
  };
  const files = { [file]: JSON.stringify(page, null, 1) + '\n' };
  if (d.menu) {
    const m = await readRepoFile(env, 'src/data/menu.json');
    const menu = JSON.parse(m.content);
    const item = { label: name, href: `/${slug}` };
    if (d.menu === 'top') menu.items.push(item);
    else { const parent = menu.items.find((i) => i.label === d.menu); if (parent) (parent.children ||= []).push(item); }
    files['src/data/menu.json'] = JSON.stringify(menu, null, 2) + '\n';
  }
  await commitFiles(env, files, `Studio: new page /${slug}${d.menu ? ' (added to the menu)' : ''}`);
  return json({ ok: true, id: slug });
}
