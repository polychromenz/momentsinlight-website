// Shared helpers for the studio's server functions (functions/api/studio/*).
// Settings (Cloudflare dashboard > the site > Settings > Variables and secrets):
//   GITHUB_TOKEN     secret  fine-grained token, Contents read/write on this repository only
//   CF_IMAGES_TOKEN  secret  Cloudflare Images API token (the same one as in .env)
//   CF_ACCOUNT_ID    text    Cloudflare account id
//   ACCESS_TEAM      text    Cloudflare Zero Trust team name (holy-disk-a1da)
//   ACCESS_AUD       text    the Moments Studio Access application's audience (AUD) tag
// Locally, `wrangler pages dev` reads them from .dev.vars; STUDIO_DEV=1 there skips the
// sign-in check (never set it in Cloudflare).

export const REPO = 'polychromenz/momentsinlight-website';
export const BRANCH = 'main';
export const IMAGES_HASH = 'qzGY-glAlQGHmkVvJZVh0Q';

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

// ---- Sign-in check: the request must carry a valid Cloudflare Access token for the studio.
const b64urlBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));
let certs = { at: 0, keys: [] };

export async function signedIn(request, env) {
  if (env.STUDIO_DEV === '1') return true;
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || !env.ACCESS_TEAM || !env.ACCESS_AUD) return false;
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return false;
  const header = b64urlJson(h);
  const claims = b64urlJson(p);
  const team = `https://${env.ACCESS_TEAM}.cloudflareaccess.com`;
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== team || !aud.includes(env.ACCESS_AUD) || claims.exp * 1000 < Date.now()) return false;
  if (Date.now() - certs.at > 3600_000 || !certs.keys.some((k) => k.kid === header.kid)) {
    certs = { at: Date.now(), keys: (await (await fetch(`${team}/cdn-cgi/access/certs`)).json()).keys ?? [] };
  }
  const jwk = certs.keys.find((k) => k.kid === header.kid);
  if (!jwk) return false;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(s), new TextEncoder().encode(`${h}.${p}`));
}

// ---- GitHub: read and write the post files.
const utf8ToB64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const b64ToUtf8 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), (c) => c.charCodeAt(0)));

export async function github(env, path, init = {}) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'moments-studio',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
  });
  const data = r.status === 204 ? null : await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, data };
}

export const postPath = (id) => `src/content/blog/${id}.md`;
export const validId = (id) => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,100}$/.test(id);

export async function readPost(env, id) {
  const r = await github(env, `contents/${postPath(id)}?ref=${BRANCH}`);
  if (r.status === 404) return { exists: false };
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${r.data?.message ?? ''}`);
  return { exists: true, sha: r.data.sha, content: b64ToUtf8(r.data.content) };
}

export async function writePost(env, id, content, sha, message) {
  return github(env, `contents/${postPath(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: utf8ToB64(content), branch: BRANCH, ...(sha ? { sha } : {}) }),
  });
}

export async function deletePost(env, id, sha, message) {
  return github(env, `contents/${postPath(id)}`, { method: 'DELETE', body: JSON.stringify({ message, sha, branch: BRANCH }) });
}
