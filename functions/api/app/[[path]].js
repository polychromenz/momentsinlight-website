// The studio phone app's door (studio-app/). Cloudflare Access guards /api/studio for browsers; a
// phone instead sends its own key ("Authorization: Bearer …", see functions-lib/app-devices.js),
// and /api/app/<path> runs the studio's own /api/studio/<path> code as that person, through the
// same access rules and activity log (functions-lib/studio-gate.js). Only the parts the app uses
// are open here: clients, emails, the calendar and contacts.
//   GET /api/app/claim?code=…   the phone collects its key after Tony approves it (no key needed)
//   GET /api/app/latest         the newest app version, for the app's update check (no key needed)
import { json } from '../../../functions-lib/studio.js';
import { gate } from '../../../functions-lib/studio-gate.js';
import { claim, deviceFor } from '../../../functions-lib/app-devices.js';
import * as today from '../studio/crm/today.js';
import * as job from '../studio/crm/job.js';
import * as email from '../studio/crm/email.js';
import * as send from '../studio/crm/send.js';
import * as step from '../studio/crm/step.js';
import * as calendar from '../studio/crm/calendar.js';
import * as appointment from '../studio/crm/appointment.js';
import * as contacts from '../studio/crm/contacts.js';
import * as contactEmail from '../studio/crm/contact-email.js';
import * as tasks from '../studio/crm/tasks.js';
import * as portal from '../studio/crm/portal.js';
import * as settings from '../studio/crm/settings.js';
import * as people from '../studio/people.js';

const ROUTES = {
  'crm/today': today, 'crm/job': job, 'crm/email': email, 'crm/send': send, 'crm/step': step,
  'crm/calendar': calendar, 'crm/appointment': appointment, 'crm/contacts': contacts, 'crm/contact-email': contactEmail,
  'crm/tasks': tasks, 'crm/portal': portal, 'crm/settings': settings, people,
};
// The app is served from https://localhost inside the phone (Capacitor), or from the app's Vite dev
// server (studio-app, any localhost port) when testing. Every call still needs a phone's key.
const ORIGIN = /^(https?|capacitor):\/\/localhost(:\d+)?$/;

function cors(request, res) {
  const origin = request.headers.get('origin');
  if (!origin || !ORIGIN.test(origin)) return res;
  const out = new Response(res.body, res);
  out.headers.set('access-control-allow-origin', origin);
  out.headers.set('access-control-allow-headers', 'authorization, content-type');
  out.headers.set('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS');
  out.headers.set('access-control-max-age', '86400');
  out.headers.append('vary', 'origin');
  return out;
}

async function handle(context) {
  const { request, env, params } = context;
  const path = [].concat(params.path ?? []).join('/');
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (path === 'claim') {
    const got = await claim(env.DB, url.searchParams.get('code'));
    return got ? json(got) : json({ waiting: true }, 202);
  }
  if (path === 'latest') {
    const o = await env.GALLERY_FILES.get('studio-app/latest.json');
    return o ? new Response(o.body, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }) : json({ version: null });
  }
  const mod = ROUTES[path];
  if (!mod) return json({ error: 'The app can’t do that.' }, 404);
  const who = await deviceFor(env.DB, request);
  if (!who) return json({ error: 'This phone isn’t linked to the studio (or was switched off). Link it again.', unlinked: true }, 401);
  // Run the studio function as if it had been asked at /api/studio/<path>.
  const inner = new Request(new URL(`/api/studio/${path}${url.search}`, url), request);
  const fn = mod[`onRequest${request.method[0]}${request.method.slice(1).toLowerCase()}`] ?? mod.onRequest;
  if (!fn) return json({ error: 'The app can’t do that.' }, 405);
  const ctx = { ...context, request: inner, data: {}, params: {} };
  return gate(ctx, { email: who.email }, () => fn(ctx));
}

export async function onRequest(context) {
  let res;
  try {
    res = await handle(context);
  } catch (e) {
    console.error('app', e.message);
    res = json({ error: 'Something went wrong in the studio. Try again.' }, 500);
  }
  return cors(context.request, res);
}
