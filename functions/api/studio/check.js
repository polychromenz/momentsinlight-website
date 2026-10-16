// Settings check for the studio: tests each key and says in plain words what's wrong.
//   GET /api/studio/check
// Shows nothing secret: only whether each setting is present and working.
import { json, REPO, BRANCH } from '../../../functions-lib/studio.js';

export async function onRequestGet({ env }) {
  const results = [];
  const add = (name, ok, note) => results.push({ name, ok, note });
  const trimmed = (v) => typeof v === 'string' && v === v.trim() && !/^["']|["']$/.test(v);

  // GitHub key: present, accepted, can see the repository, and can write to it.
  if (!env.GITHUB_TOKEN) add('GITHUB_TOKEN', false, 'Missing. Add it in Cloudflare > the site > Settings > Variables and secrets.');
  else if (!trimmed(env.GITHUB_TOKEN)) add('GITHUB_TOKEN', false, 'Has a space or quote mark at the start or end. Delete it and add it again, pasting just the token.');
  else {
    const r = await fetch(`https://api.github.com/repos/${REPO}`, {
      headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'moments-studio' },
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) add('GITHUB_TOKEN', false, 'GitHub doesn’t accept this key (it may be mistyped, expired or deleted). Make a new one and replace it.');
    else if (r.status === 404) add('GITHUB_TOKEN', false, `The key can’t see ${REPO}. In the key’s settings, under Repository access, choose this repository.`);
    else if (!r.ok) add('GITHUB_TOKEN', false, `GitHub answered ${r.status}: ${d.message ?? ''}`);
    else if (!d.permissions?.push) add('GITHUB_TOKEN', false, 'The key can read the website but not save to it. In the key’s settings, set Permissions > Contents to “Read and write”.');
    else {
      const b = await fetch(`https://api.github.com/repos/${REPO}/branches/${BRANCH}`, {
        headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'moments-studio' },
      });
      add('GITHUB_TOKEN', b.ok, b.ok ? 'Working: can read and save posts.' : `Can’t find the ${BRANCH} branch (${b.status}).`);
    }
  }

  // Cloudflare Images key and account.
  if (!env.CF_ACCOUNT_ID) add('CF_ACCOUNT_ID', false, 'Missing.');
  else if (!trimmed(env.CF_ACCOUNT_ID)) add('CF_ACCOUNT_ID', false, 'Has a space or quote mark at the start or end.');
  if (!env.CF_IMAGES_TOKEN) add('CF_IMAGES_TOKEN', false, 'Missing.');
  else if (!trimmed(env.CF_IMAGES_TOKEN)) add('CF_IMAGES_TOKEN', false, 'Has a space or quote mark at the start or end.');
  else if (env.CF_ACCOUNT_ID) {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images/v1/stats`, { headers: { authorization: `Bearer ${env.CF_IMAGES_TOKEN}` } });
    const d = await r.json().catch(() => ({}));
    add('CF_IMAGES_TOKEN', r.ok && d.success, r.ok && d.success ? 'Working: can upload photos.' : `Cloudflare Images says: ${d.errors?.[0]?.message ?? r.status}. Check the key and the account ID.`);
  }

  // Sign-in settings (if these were wrong you wouldn't see this page, but check anyway).
  add('ACCESS_TEAM', !!env.ACCESS_TEAM && trimmed(env.ACCESS_TEAM), env.ACCESS_TEAM ? 'Set.' : 'Missing.');
  add('ACCESS_AUD', !!env.ACCESS_AUD && trimmed(env.ACCESS_AUD), env.ACCESS_AUD ? 'Set.' : 'Missing.');

  // Suggestions (Cloudflare Workers AI).
  add('Suggestions (AI)', !!env.AI, env.AI ? 'Switched on.' : 'Not switched on for this site yet.');

  return json({ allWorking: results.every((r) => r.ok), results });
}
