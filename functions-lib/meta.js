// Facebook and Instagram for Studio > Social (milestone 2, docs/social-media-manager-plan.md).
// One Meta app (developers.facebook.com, Business type, kept in Development mode: Tony is its admin,
// so it can post to his own Page and Instagram without Meta's app review). Tony clicks Connect on the
// Social page, logs in to Facebook and allows the studio in; the callback swaps the login for a
// long-lived Page token (it doesn't expire) and finds the Instagram professional account linked to
// that Page. Both tokens are kept encrypted in settings ('meta_conn').
//
// Publishing: when Tony approves a Facebook or Instagram post, the editor makes its photo files (his
// crop, the platform's size) and uploads them here (photos.momentsinlight.co.nz/social/…), because
// Meta fetches photos from a public address. At the post's time the timer (functions/api/crm/run.js,
// step 14) publishes it, or Tony clicks Post now. Nothing that isn't approved is ever posted.
//
// Needs the Cloudflare settings META_APP_ID and META_APP_SECRET (a secret), and the app's Valid OAuth
// Redirect URI set to REDIRECT below.

import { publishPin, pinterestOn } from './pinterest.js';
import { tagged } from './social-tags.js';

export const SITE = 'https://www.momentsinlight.co.nz';
export const REDIRECT = `${SITE}/api/studio/meta/callback`;
const V = 'v21.0';
const GRAPH = `https://graph.facebook.com/${V}`;
export const SCOPES = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'business_management', 'instagram_basic', 'instagram_content_publish'];
export const MEDIA_ORIGIN = 'https://photos.momentsinlight.co.nz';

export const metaReady = (env) => !!(env.META_APP_ID && env.META_APP_SECRET);
// Business apps using "Facebook Login for Business" choose their permissions in a configuration
// (META_CONFIG_ID); otherwise the permissions are asked for here.
export const loginUrl = (env, state) => `https://www.facebook.com/${V}/dialog/oauth?${new URLSearchParams({ client_id: env.META_APP_ID, redirect_uri: REDIRECT, state, response_type: 'code',
  ...(env.META_CONFIG_ID ? { config_id: env.META_CONFIG_ID, override_default_response_type: 'true' } : { scope: SCOPES.join(',') }) })}`;

// ---- Tokens, kept encrypted (key from META_APP_SECRET) ----
const enc = new TextEncoder();
const b64 = (u) => { let s = ''; for (const c of new Uint8Array(u)) s += String.fromCharCode(c); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function key(env) {
  const base = await crypto.subtle.importKey('raw', enc.encode(env.META_APP_SECRET), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('moments-studio-meta'), info: enc.encode('page-token') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function seal(env, text) { const iv = crypto.getRandomValues(new Uint8Array(12)); return `${b64(iv)}.${b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(env), enc.encode(text)))}`; }
async function open(env, v) { const [iv, d] = v.split('.'); return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await key(env), unb64(d))); }

/** What's connected (no tokens): { page_id, page_name, ig_id, ig_username, pages: [{id, name, ig}], connected_at } or null. */
export async function metaConnection(db) {
  const r = await db.prepare(`SELECT value FROM settings WHERE key = 'meta_conn'`).first();
  return r ? JSON.parse(r.value) : null;
}
async function saveConn(db, v) {
  if (!v) return db.prepare(`DELETE FROM settings WHERE key = 'meta_conn'`).run();
  await db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('meta_conn', ?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = ?2`)
    .bind(JSON.stringify(v), new Date().toISOString()).run();
}
export const disconnectMeta = (db) => saveConn(db, null);
/** Is this platform connected (so approved posts publish themselves)? */
export async function connectedFor(db, platform) {
  if (platform === 'pinterest') return true; // the app, or the RSS feed
  const c = await metaConnection(db);
  return !!c && ((platform === 'facebook' && !!c.page_id) || (platform === 'instagram' && !!c.ig_id));
}
const publicConn = (c) => c && { page_id: c.page_id, page_name: c.page_name, ig_id: c.ig_id, ig_username: c.ig_username, pages: (c.pages ?? []).map(({ id, name, ig_username }) => ({ id, name, ig_username })), connected_at: c.connected_at };
export const metaStatus = async (env) => ({ ready: metaReady(env), connection: publicConn(await metaConnection(env.DB)) });

/** A Graph API call; throws with Meta's own message. */
async function graph(method, path, params = {}) {
  const url = new URL(`${GRAPH}${path}`);
  const init = { method };
  if (method === 'GET') url.search = new URLSearchParams(params).toString();
  else { init.headers = { 'content-type': 'application/x-www-form-urlencoded' }; init.body = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])).toString(); }
  const r = await fetch(url, init);
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error(`Meta: ${d.error?.error_user_msg || d.error?.message || r.status}`);
  return d;
}

/** After Tony allows the studio in: long-lived tokens, his Pages and their Instagram accounts. */
export async function finishMetaConnect(env, code) {
  const short = await graph('GET', '/oauth/access_token', { client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, redirect_uri: REDIRECT, code });
  const long = await graph('GET', '/oauth/access_token', { grant_type: 'fb_exchange_token', client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, fb_exchange_token: short.access_token });
  // Page tokens fetched with a long-lived user token don't expire.
  const pages = (await graph('GET', '/me/accounts', { access_token: long.access_token, fields: 'id,name,access_token,instagram_business_account{id,username}', limit: '50' })).data ?? [];
  if (!pages.length) throw new Error('No Facebook Pages came through. When Facebook asks, tick your Moments in Light Page (and its Instagram).');
  const before = await metaConnection(env.DB);
  const sealed = await Promise.all(pages.map(async (p) => ({ id: p.id, name: p.name, token: await seal(env, p.access_token), ig: p.instagram_business_account?.id ?? null, ig_username: p.instagram_business_account?.username ?? null })));
  // Keep the Page chosen before if it's still there; otherwise the one with Instagram, else the first.
  const pick = sealed.find((p) => p.id === before?.page_id) ?? sealed.find((p) => /moments/i.test(p.name) && p.ig) ?? sealed.find((p) => p.ig) ?? sealed[0];
  await saveConn(env.DB, { ...choose(pick), pages: sealed, connected_at: new Date().toISOString() });
}
const choose = (p) => ({ page_id: p.id, page_name: p.name, page_token: p.token, ig_id: p.ig, ig_username: p.ig_username });

/** Tony picking a different Page (when he manages more than one). */
export async function choosePage(db, id) {
  const c = await metaConnection(db);
  const p = c?.pages?.find((x) => x.id === String(id));
  if (!p) throw new Error('That Page isn’t connected.');
  await saveConn(db, { ...c, ...choose(p) });
}

// ---- Photos for a post: the files the editor made, kept where Meta can fetch them ----
/** Store an approved post's photo files (JPEGs, in order), or a Reel's video (one MP4). Returns their public addresses. */
export async function storeMedia(env, postId, files, video = false) {
  const stamp = Date.now().toString(36);
  const urls = [];
  for (let n = 0; n < files.length; n++) {
    const k = `social/${postId}/${stamp}-${n + 1}.${video ? 'mp4' : 'jpg'}`;
    await env.GALLERY_WEB.put(k, files[n], { httpMetadata: { contentType: video ? 'video/mp4' : 'image/jpeg', cacheControl: 'public, max-age=31536000, immutable' } });
    urls.push(`${MEDIA_ORIGIN}/${k}`);
  }
  return urls;
}

// ---- Publishing ----
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** The caption as it goes out: Facebook gets the link at the end if it isn't in the caption already. */
const message = (p) => (p.platform === 'facebook' && p.link && !p.caption.includes(p.link) ? `${p.caption.trim()}\n\n${p.link}` : p.caption.trim());

/** Publish one approved post now. Returns { id, url }. */
export async function publish(env, post) {
  // Venues and suppliers tagged: the credit line in the caption, and Instagram's photo tag.
  const t = await tagged(env, post).catch(() => ({ caption: post.caption, handles: [] }));
  const p = { ...post, caption: t.caption };
  const userTags = t.handles.length ? JSON.stringify(t.handles.slice(0, 20).map((username, n) => ({ username, x: 0.2 + (n % 4) * 0.2, y: 0.85 }))) : null;
  // A photo tag Instagram won't take (e.g. a changed handle) mustn't stop the post: try once without.
  const igMedia = async (id, fields) => {
    if (!userTags) return graph('POST', `/${id}/media`, fields);
    try { return await graph('POST', `/${id}/media`, { ...fields, user_tags: userTags }); } catch { return graph('POST', `/${id}/media`, fields); }
  };
  // Pinterest: through the app once it's connected; until then the RSS feed (functions/feeds/pinterest.js)
  // carries it: marking it posted puts it in the feed, and Pinterest picks it up within about a day.
  if (p.platform === 'pinterest') {
    if (await pinterestOn(env.DB)) return publishPin(env, p);
    if (!JSON.parse(p.media || '[]').length) throw new Error('Its image wasn’t made. Open the pin, Back to draft, then Approve again.');
    return { id: null, url: null };
  }
  const c = await metaConnection(env.DB);
  if (!c) throw new Error('Facebook and Instagram aren’t connected.');
  const media = JSON.parse(p.media || '[]');
  if (!media.length) throw new Error('Its photos weren’t made. Open the post, Back to draft, then Approve again.');
  const token = await open(env, c.page_token);
  const reel = p.format === 'reel';
  if (reel && !String(media[0]).endsWith('.mp4')) throw new Error('Its video wasn’t made. Open the post, Back to draft, then Approve again.');
  if (p.platform === 'facebook' && reel) {
    const d = await graph('POST', `/${c.page_id}/videos`, { file_url: media[0], description: message(p), published: 'true', access_token: token });
    const link = await graph('GET', `/${d.id}`, { fields: 'permalink_url', access_token: token }).then((x) => x.permalink_url).catch(() => null);
    return { id: d.id, url: link && link.startsWith('/') ? `https://www.facebook.com${link}` : link };
  }
  if (p.platform === 'facebook') {
    if (media.length === 1) {
      const d = await graph('POST', `/${c.page_id}/photos`, { url: media[0], caption: message(p), published: 'true', access_token: token });
      const id = d.post_id || d.id;
      return { id, url: await graph('GET', `/${id}`, { fields: 'permalink_url', access_token: token }).then((x) => x.permalink_url).catch(() => null) };
    }
    const ids = [];
    for (const m of media) ids.push((await graph('POST', `/${c.page_id}/photos`, { url: m, published: 'false', access_token: token })).id);
    const d = await graph('POST', `/${c.page_id}/feed`, { message: message(p), attached_media: ids.map((media_fbid) => ({ media_fbid })), access_token: token });
    return { id: d.id, url: await graph('GET', `/${d.id}`, { fields: 'permalink_url', access_token: token }).then((x) => x.permalink_url).catch(() => null) };
  }
  if (p.platform === 'instagram') {
    if (!c.ig_id) throw new Error('No Instagram account is linked to the connected Facebook Page.');
    const ready = async (id, tries = 10, gap = 1500) => { // Instagram fetches the photo first (a second or two; a video longer).
      for (let n = 0; n < tries; n++) {
        const s = await graph('GET', `/${id}`, { fields: 'status_code', access_token: token });
        if (s.status_code === 'FINISHED') return;
        if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`Instagram couldn’t use that ${reel ? 'video' : 'photo'}.`);
        await wait(gap);
      }
      throw new Error(`Instagram took too long with the ${reel ? 'video' : 'photo'}. Try again in a few minutes.`);
    };
    let container;
    if (reel) {
      container = (await graph('POST', `/${c.ig_id}/media`, { media_type: 'REELS', video_url: media[0], caption: message(p), share_to_feed: 'true', access_token: token })).id;
      await ready(container, 40, 3000);
    } else if (media.length === 1) {
      container = (await igMedia(c.ig_id, { image_url: media[0], caption: message(p), access_token: token })).id;
    } else {
      const kids = [];
      for (const [n, m] of media.slice(0, 10).entries()) {
        const fields = { image_url: m, is_carousel_item: 'true', access_token: token };
        kids.push((await (n === 0 ? igMedia(c.ig_id, fields) : graph('POST', `/${c.ig_id}/media`, fields))).id); // tagged on the first photo
      }
      for (const k of kids) await ready(k);
      container = (await graph('POST', `/${c.ig_id}/media`, { media_type: 'CAROUSEL', children: kids.join(','), caption: message(p), access_token: token })).id;
    }
    await ready(container);
    const d = await graph('POST', `/${c.ig_id}/media_publish`, { creation_id: container, access_token: token });
    return { id: d.id, url: await graph('GET', `/${d.id}`, { fields: 'permalink', access_token: token }).then((x) => x.permalink).catch(() => null) };
  }
  throw new Error('Only Facebook and Instagram can post themselves so far.');
}

/** Claim and publish one post (from the timer or Post now). Never throws; records the result. */
export async function publishPost(env, p) {
  const db = env.DB;
  const claim = await db.prepare(`UPDATE social_posts SET status = 'posting', posting_at = ?2, error = NULL WHERE id = ?1 AND status IN ('approved', 'failed')`).bind(p.id, new Date().toISOString()).run();
  if (!claim.meta.changes) return { ok: false, error: 'It isn’t waiting to be posted.' };
  try {
    const r = await publish(env, p);
    await db.prepare(`UPDATE social_posts SET status = 'posted', posted_at = ?2, remote_id = ?3, remote_url = ?4 WHERE id = ?1`).bind(p.id, new Date().toISOString(), r.id, r.url).run();
    return { ok: true, ...r };
  } catch (e) {
    await db.prepare(`UPDATE social_posts SET status = 'failed', error = ?2 WHERE id = ?1`).bind(p.id, String(e.message).slice(0, 500)).run();
    return { ok: false, error: e.message };
  }
}

/** Now in NZ as 'YYYY-MM-DDTHH:MM' (how post_at is kept). */
const nzStamp = (d = new Date()) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};

/** The timer: approved Facebook and Instagram posts whose time has come (NZ). */
export async function publishDue(env) {
  const nowNz = nzStamp();
  const c = metaReady(env) ? await metaConnection(env.DB) : null;
  const plats = [c?.page_id && 'facebook', c?.ig_id && 'instagram', 'pinterest'].filter(Boolean);
  if (!plats.length) return 'not connected';
  // A post stuck mid-publish (the run stopped) goes back to failed so Tony sees it.
  await env.DB.prepare(`UPDATE social_posts SET status = 'failed', error = 'Stopped part-way through posting: check the platform before trying again' WHERE status = 'posting' AND posting_at < ?1`)
    .bind(new Date(Date.now() - 30 * 60_000).toISOString()).run();
  const due = (await env.DB.prepare(`SELECT * FROM social_posts WHERE status = 'approved' AND post_at <= ?1 AND platform IN (${plats.map((x) => `'${x}'`).join(',')}) AND post_at >= ?2 ORDER BY post_at LIMIT 2`)
    .bind(nowNz, nzStamp(new Date(Date.now() - 3 * 86400_000))).all()).results; // (older ones wait for Tony)
  const out = [];
  for (const p of due) { const r = await publishPost(env, p); out.push(`${p.platform} ${r.ok ? 'posted' : `failed: ${r.error}`}`); }
  return out.join('; ') || 'nothing due';
}
