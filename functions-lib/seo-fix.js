// Fixing the site health check's findings from the studio (SEO page > Site health check > Fix):
// photo descriptions, Google titles and descriptions. Each finding is traced to the file it comes
// from (a blog post, an imported page's data, the reviews), and all the changes are saved to
// GitHub in one commit, so the site rebuilds once.
//
// Where things live:
//   /blog/<post>                  src/content/blog/<post>.md   (seoTitle, description, gallery alts, thumbnailAlt)
//   a post's cover on any page    the post's .md, found from the built /studio/posts.json
//   review photos (/reviews/...)  src/data/reviews.json
//   other pages (/abel-estate…)   src/data/pages/<page>.json   (title, description, photo alts)
// Pages built in code (the home page, Weddings, blog lists) can't be changed here.
import { github, readRepoFile, BRANCH } from './studio.js';
import { builtPosts } from './schedules.js';

const key = (u) => String(u ?? '').replace(/\/(public(\.webp)?|w=[^/]*)$/, '');
const postFile = (id) => `src/content/blog/${id}.md`;
const pageFile = (path) => `src/data/pages${path}.json`;
const HOME = 'src/data/home.json';
/** The file a page's own words live in (null = built into the site's code). */
export const fileFor = (path) => (path === '/' ? HOME : isPost(path) ? postFile(path.slice(6)) : !path.startsWith('/blog') ? pageFile(path) : null);
const isPost = (path) => /^\/blog\/[a-z0-9-]+$/.test(path) && !/^\/blog\/(search|page)$/.test(path);

// ---- Front matter, line by line (keeps the file exactly as it was apart from the change) ----
const split = (text) => { const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n[\s\S]*)?$/); return m ? { fm: m[1].replace(/\r\n/g, '\n'), rest: m[2] ?? '' } : null; };
const join = (fm, rest) => `---\n${fm}\n---${rest}`;
function getField(fm, k) {
  const m = fm.match(new RegExp(`^${k}: (.*)$`, 'm'));
  if (!m) return undefined;
  const v = m[1].trim();
  try { return v.startsWith('"') ? JSON.parse(v) : v.replace(/^'(.*)'$/, '$1'); } catch { return v.replace(/^"|"$/g, ''); }
}
function setField(fm, k, value, after) {
  const line = `${k}: ${JSON.stringify(value)}`;
  // A value can run over several lines (until the next "key:" line).
  const re = new RegExp(`^${k}: [\\s\\S]*?(?=^[A-Za-z][\\w-]*:|(?![\\s\\S]))`, 'm');
  if (new RegExp(`^${k}: `, 'm').test(fm)) return fm.replace(re, () => `${line}\n`).replace(/\n+$/, '');
  for (const a of after) { const am = fm.match(new RegExp(`^${a}: .*$`, 'm')); if (am) return fm.replace(am[0], `${am[0]}\n${line}`); }
  return `${fm}\n${line}`;
}
const galleryLines = (fm) => fm.split('\n').map((l, i) => ({ l, i })).filter((x) => x.l.startsWith('  - {'));
function galleryAlt(fm, src) {
  for (const { l } of galleryLines(fm)) { try { const o = JSON.parse(l.slice(4)); if (key(o.src) === key(src)) return { found: true, alt: o.alt ?? '' }; } catch { /* skip */ } }
  return { found: false, alt: '' };
}
function setGalleryAlt(fm, src, alt) {
  const lines = fm.split('\n');
  let done = false;
  for (const { l, i } of galleryLines(fm)) {
    try { const o = JSON.parse(l.slice(4)); if (key(o.src) === key(src)) { o.alt = alt; lines[i] = `  - ${JSON.stringify(o)}`; done = true; } } catch { /* skip */ }
  }
  return done ? lines.join('\n') : null;
}

// ---- JSON files: every object with this photo gets the description ----
function walk(o, fn) { if (Array.isArray(o)) o.forEach((x) => walk(x, fn)); else if (o && typeof o === 'object') { fn(o); Object.values(o).forEach((x) => walk(x, fn)); } }
const jsonIndent = (text) => text.match(/\n( +)"/)?.[1].length ?? 2;
function jsonPhotoAlt(text, src) { let alt = null; walk(JSON.parse(text), (o) => { if (typeof o.src === 'string' && key(o.src) === key(src) && o.alt) alt ??= o.alt; }); return alt ?? ''; }
function setJsonPhotoAlt(text, src, alt) {
  const d = JSON.parse(text); let n = 0;
  walk(d, (o) => { if (typeof o.src === 'string' && key(o.src) === key(src)) { o.alt = alt; n++; } });
  return n ? JSON.stringify(d, null, jsonIndent(text)) + (text.endsWith('\n') ? '\n' : '') : null;
}

/** Replace a piece of wording wherever it appears in a page's data (headings and paragraphs). */
export function replaceInJson(text, before, after) {
  const d = JSON.parse(text); let n = 0;
  const visit = (o) => {
    if (!o || typeof o !== 'object') return;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (typeof v === 'string' && before && v.includes(before)) { o[k] = v.split(before).join(after); n++; } else visit(v);
    }
  };
  visit(d);
  return n ? JSON.stringify(d, null, jsonIndent(text)) + (text.endsWith('\n') ? '\n' : '') : null;
}
/** Every string in a page's data (for finding the source of a heading or paragraph). */
export function jsonStrings(text) { const out = []; walk(JSON.parse(text), (o) => { for (const v of Object.values(o)) if (typeof v === 'string') out.push(v); }); return out; }
export { split, getField };

/** Which file a photo's description lives in. */
async function photoFile(env, path, src, covers) {
  if (/\/reviews\//.test(src)) return { file: 'src/data/reviews.json', kind: 'review' };
  const cover = covers.find((p) => key(p.cover) === key(src));
  if (cover) return { file: postFile(cover.id), kind: 'cover' };
  if (isPost(path)) return { file: postFile(path.slice(6)), kind: 'gallery' };
  if (path !== '/' && !path.startsWith('/blog')) return { file: pageFile(path), kind: 'page' };
  return { file: null };
}

const cache = (env) => { const files = new Map(); return async (file) => { if (!files.has(file)) files.set(file, await readRepoFile(env, file).then((f) => (f.exists ? { ...f, content: f.content.replace(/\r\n/g, '\n') } : f)).catch(() => ({ exists: false }))); return files.get(file); }; };

/** What can be fixed on a page, and the current wording. */
export async function fixInfo(env, path, photos = []) {
  const read = cache(env);
  const { posts = [] } = await builtPosts(env).catch(() => ({}));
  const out = { path, photos: [], page: { editable: false } };
  for (const src of photos.slice(0, 60)) {
    const where = await photoFile(env, path, src, posts);
    const f = where.file && await read(where.file);
    if (!f?.exists) { out.photos.push({ src, editable: false, why: 'This photo is part of the page’s design; ask Claude to describe it.' }); continue; }
    let alt = '';
    if (where.file.endsWith('.md')) {
      const fm = split(f.content)?.fm ?? '';
      const g = galleryAlt(fm, src);
      alt = where.kind === 'cover' ? (getField(fm, 'thumbnailAlt') || g.alt) : g.alt;
    } else alt = jsonPhotoAlt(f.content, src);
    out.photos.push({ src, editable: true, alt, file: where.file, post: where.file.endsWith('.md') ? where.file.slice(17, -3) : null });
  }
  // The page's Google title and description.
  const file = fileFor(path);
  const f = file && await read(file);
  if (f?.exists) {
    if (file.endsWith('.md')) { const fm = split(f.content).fm; out.page = { editable: true, file, title: getField(fm, 'seoTitle') || getField(fm, 'title') || '', description: getField(fm, 'description') || '', editor: `/studio/edit?id=${path.slice(6)}` }; }
    else { const d = JSON.parse(f.content); out.page = { editable: true, file, title: d.title ?? '', description: d.description ?? '' }; }
  } else out.page = { editable: false, why: 'This page is built into the site’s code; ask Claude to change its title or description.' };
  return out;
}

/** Save changes: [{ path, src, alt }] and [{ path, title?, description? }], as one commit. */
export async function saveFixes(env, changes) {
  const read = cache(env);
  const { posts = [] } = await builtPosts(env).catch(() => ({}));
  const edits = new Map(); // file -> new content
  const current = async (file) => { if (edits.has(file)) return edits.get(file); const f = await read(file); if (!f.exists) throw new Error(`${file} wasn’t found.`); return f.content; };
  let photos = 0, pages = 0;
  for (const c of changes) {
    if (c.src) {
      const alt = String(c.alt ?? '').trim().slice(0, 250);
      if (!alt) continue;
      const where = await photoFile(env, c.path, c.src, posts);
      if (!where.file) continue;
      let text = await current(where.file);
      if (where.file.endsWith('.md')) {
        const s = split(text); if (!s) continue;
        let fm = setGalleryAlt(s.fm, c.src, alt);
        if (fm === null) fm = setField(s.fm, 'thumbnailAlt', alt, ['thumbnailPosition', 'thumbnail']);
        text = join(fm, s.rest);
      } else {
        const next = setJsonPhotoAlt(text, c.src, alt);
        if (next === null) continue;
        text = next;
      }
      edits.set(where.file, text); photos++;
    } else if (c.title !== undefined || c.description !== undefined) {
      const file = fileFor(c.path);
      if (!file) continue;
      let text = await current(file);
      if (file.endsWith('.md')) {
        const s = split(text);
        let fm = s.fm;
        if (c.title !== undefined && c.title.trim()) fm = setField(fm, 'seoTitle', c.title.trim().slice(0, 120), ['title']);
        if (c.description !== undefined && c.description.trim()) fm = setField(fm, 'description', c.description.trim().slice(0, 320), ['seoTitle', 'title']);
        text = join(fm, s.rest);
      } else {
        const d = JSON.parse(text);
        if (c.title?.trim()) d.title = c.title.trim().slice(0, 120);
        if (c.description?.trim()) d.description = c.description.trim().slice(0, 320);
        text = JSON.stringify(d, null, jsonIndent(text)) + (text.endsWith('\n') ? '\n' : '');
      }
      edits.set(file, text); pages++;
    }
  }
  for (const c of changes) {
    if (!c.h1 && !c.text && !c.append) continue;
    const file = fileFor(c.path);
    if (!file) continue;
    let text = await current(file);
    if (file === HOME) {
      const d = JSON.parse(text);
      if (c.h1?.after?.trim()) d.h1 = c.h1.after.trim();
      if (c.text?.after?.trim()) { if (d.intro !== c.text.before) throw new Error('The home page’s opening line has changed since; suggest again.'); d.intro = c.text.after.trim(); }
      text = JSON.stringify(d, null, 2) + '\n';
    } else if (file.endsWith('.md')) {
      const sp = split(text);
      let { fm, rest } = sp;
      if (c.h1?.after?.trim()) fm = setField(fm, 'title', c.h1.after.trim().slice(0, 150), []);
      if (c.text?.after?.trim()) { if (!rest.includes(c.text.before)) throw new Error(`The wording on ${c.path} has changed since; suggest again.`); rest = rest.replace(c.text.before, () => c.text.after.trim()); }
      if (c.append?.trim()) rest = rest.replace(/\s*$/, `\n\n${c.append.trim()}\n`);
      text = join(fm, rest);
    } else {
      for (const [b, a] of [c.h1, c.text].filter((x) => x?.after?.trim()).map((x) => [x.before, x.after.trim()])) {
        const next = replaceInJson(text, b, a);
        if (next === null) throw new Error(`The wording on ${c.path} has changed since; suggest again.`);
        text = next;
      }
    }
    edits.set(file, text); pages++;
  }
  if (!edits.size) return { files: 0, photos: 0, pages: 0 };
  // One commit for every file: GitHub's tree API (the site rebuilds once).
  const ref = await github(env, `git/ref/heads/${BRANCH}`);
  if (!ref.ok) throw new Error(`GitHub ${ref.status}: ${ref.data?.message ?? ''}`);
  const base = ref.data.object.sha;
  const baseCommit = await github(env, `git/commits/${base}`);
  const tree = await github(env, 'git/trees', { method: 'POST', body: JSON.stringify({ base_tree: baseCommit.data.tree.sha, tree: [...edits].map(([path, content]) => ({ path, mode: '100644', type: 'blob', content })) }) });
  if (!tree.ok) throw new Error(`GitHub ${tree.status}: ${tree.data?.message ?? ''}`);
  const what = [photos && `${photos} photo description${photos === 1 ? '' : 's'}`, pages && `${pages} Google title/description${pages === 1 ? '' : 's'}`].filter(Boolean).join(' and ');
  const commit = await github(env, 'git/commits', { method: 'POST', body: JSON.stringify({ message: `Studio: ${what} (site health fixes)`, tree: tree.data.sha, parents: [base] }) });
  if (!commit.ok) throw new Error(`GitHub ${commit.status}: ${commit.data?.message ?? ''}`);
  const upd = await github(env, `git/refs/heads/${BRANCH}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.data.sha }) });
  if (!upd.ok) throw new Error(upd.status === 422 ? 'Something else was saved at the same moment. Click Save again.' : `GitHub ${upd.status}: ${upd.data?.message ?? ''}`);
  return { files: edits.size, photos, pages };
}

/** Take fixed items off the saved health check, so the list shows what's left. */
export async function markFixed(db, changes) {
  const row = await db.prepare(`SELECT value FROM settings WHERE key = 'site_health'`).first();
  if (!row) return;
  const st = JSON.parse(row.value);
  const s = st.summary;
  if (!s) return;
  for (const c of changes) {
    if (c.src && c.alt?.trim()) {
      for (const n of s.noAlt ?? []) if (n.photos?.length) { const before = n.photos.length; n.photos = n.photos.filter((p) => key(p) !== key(c.src)); n.count -= before - n.photos.length; }
      s.noAlt = (s.noAlt ?? []).filter((n) => n.count > 0);
    }
    if (c.description?.trim()) s.noDesc = (s.noDesc ?? []).filter((p) => p !== c.path);
    if (c.title?.trim()) {
      const ok = c.title.trim().length >= 25 && c.title.trim().length <= 65;
      if (ok) s.shortTitles = (s.shortTitles ?? []).filter((x) => x.path !== c.path);
      s.dupTitles = (s.dupTitles ?? []).map((x) => ({ ...x, pages: x.pages.filter((p) => p !== c.path) })).filter((x) => x.pages.length > 1);
    }
  }
  await db.prepare(`UPDATE settings SET value = ?1, updated_at = ?2 WHERE key = 'site_health'`).bind(JSON.stringify(st), new Date().toISOString()).run();
}
