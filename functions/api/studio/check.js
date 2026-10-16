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
    const t = env.GITHUB_TOKEN;
    // Enough to compare with the key you made, not enough to use it.
    const shape = `starts “${t.slice(0, 11)}”, ${t.length} characters long, ends “…${t.slice(-4)}”`;
    if (r.status === 401) add('GITHUB_TOKEN', false, `GitHub doesn’t accept the key stored here (${shape}). If that doesn’t match your new key, the site hasn’t picked it up yet: replace it and rebuild.`);
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

  // Stats (Cloudflare Web Analytics): a read-only analytics key.
  if (!env.CF_ANALYTICS_TOKEN) add('CF_ANALYTICS_TOKEN', false, 'Missing (needed for the Stats page only).');
  else {
    const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`,'content-type': 'application/json' },
      body: JSON.stringify({ query: 'query { viewer { accounts(filter: { accountTag: "' + env.CF_ACCOUNT_ID + '" }) { rumPageloadEventsAdaptiveGroups(limit: 1, filter: { date_geq: "' + new Date(Date.now() - 86400000).toISOString().slice(0, 10) + '" }) { count } } } }' }),
    });
    const d = await r.json().catch(() => ({}));
    const err = d.errors?.[0]?.message;
    add('CF_ANALYTICS_TOKEN', r.ok && !err, r.ok && !err ? 'Working: can read your visitor numbers.' : `Cloudflare says: ${err ?? r.status}. The key needs Account > Account Analytics > Read.`);
  }

  // Suggestions (Cloudflare Workers AI).
  add('Suggestions (AI)', !!env.AI, env.AI ? 'Switched on.' : 'Not switched on for this site yet.');

  return json({ allWorking: results.every((r) => r.ok), results });
}
