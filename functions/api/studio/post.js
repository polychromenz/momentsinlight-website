// One post's file in the repository.
//   GET    /api/studio/post?id=slug           -> { exists, sha, content }
//   PUT    /api/studio/post  { id, content, sha?, message }  -> { sha }   (saving publishes the
//          change: Cloudflare rebuilds the site in about a minute)
//   DELETE /api/studio/post?id=slug&sha=...   -> { ok }
import { json, readPost, writePost, deletePost, validId } from '../../../functions-lib/studio.js';

export async function onRequestGet({ request, env }) {
  const id = new URL(request.url).searchParams.get('id');
  if (!validId(id)) return json({ error: 'That post address isn’t valid.' }, 400);
  try {
    return json(await readPost(env, id));
  } catch (e) {
    return json({ error: `Couldn’t open the post (${e.message}).` }, 502);
  }
}

export async function onRequestPut({ request, env }) {
  const { id, content, sha, message } = await request.json().catch(() => ({}));
  if (!validId(id)) return json({ error: 'That post address isn’t valid.' }, 400);
  if (typeof content !== 'string' || !content.startsWith('---')) return json({ error: 'The post is empty.' }, 400);
  const r = await writePost(env, id, content, sha, message || `Studio: update ${id}`);
  if (r.status === 409 || r.status === 422) {
    return json({ error: 'This post was changed somewhere else since you opened it. Reload to get the latest version.', conflict: true }, 409);
  }
  if (!r.ok) return json({ error: `Couldn’t save (GitHub ${r.status}: ${r.data?.message ?? ''}).` }, 502);
  return json({ sha: r.data.content.sha });
}

export async function onRequestDelete({ request, env }) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const sha = url.searchParams.get('sha');
  if (!validId(id) || !sha) return json({ error: 'That post address isn’t valid.' }, 400);
  const r = await deletePost(env, id, sha, `Studio: delete ${id}`);
  if (!r.ok) return json({ error: `Couldn’t delete (GitHub ${r.status}).` }, 502);
  return json({ ok: true });
}
