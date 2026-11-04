// The studio phone app, from the browser (/studio/app): link a phone, see linked phones, switch one
// off, and download the app. See functions-lib/app-devices.js for how linking works.
//   GET  /api/studio/app                       linked phones and the newest app version
//   GET  /api/studio/app?download=1            the app's APK (to install on an Android phone)
//   POST /api/studio/app { action: 'link', code, name }   approve the phone showing that code
//   POST /api/studio/app { action: 'revoke', id }         switch a phone off
import { json } from '../../../functions-lib/studio.js';
import { link, listDevices, revoke } from '../../../functions-lib/app-devices.js';

export async function onRequestGet({ request, env }) {
  if (new URL(request.url).searchParams.get('download')) {
    const o = await env.GALLERY_FILES.get('studio-app/MomentsStudio.apk');
    if (!o) return json({ error: 'The app hasn’t been uploaded yet.' }, 404);
    return new Response(o.body, { headers: { 'content-type': 'application/vnd.android.package-archive', 'content-disposition': 'attachment; filename="MomentsStudio.apk"', 'cache-control': 'no-store' } });
  }
  const latest = await env.GALLERY_FILES.get('studio-app/latest.json');
  return json({ devices: await listDevices(env.DB), latest: latest ? await latest.json() : null });
}

export async function onRequestPost({ request, env, data }) {
  const d = await request.json().catch(() => ({}));
  if (d.action === 'link') {
    try {
      await link(env.DB, d.code, data.user.email, d.name);
    } catch (e) {
      return json({ error: e.message }, 400);
    }
    return json({ ok: true });
  }
  if (d.action === 'revoke') {
    const r = await revoke(env.DB, d.id);
    return r.meta.changes ? json({ ok: true }) : json({ error: 'That phone is already switched off.' }, 400);
  }
  return json({ error: 'What should happen?' }, 400);
}
