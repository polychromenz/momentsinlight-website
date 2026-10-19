// Client galleries live at galleries.momentsinlight.co.nz/{slug} (and momentsinlight.co.nz/g/{slug},
// which the studio uses for previews). Both show the one gallery page (src/pages/gallery-view.astro),
// which reads the slug from the address. Everything else on the website passes straight through,
// except studio pages in an area someone's access hides (Settings > People): back to the studio home.
import { signedIn } from '../functions-lib/studio.js';
import { accessFor } from '../functions-lib/people.js';
import { areaOfPage, levelFor } from '../functions-lib/areas.js';

const GALLERY_HOST = /^galleries\./;
const SHARED = /^\/(_astro|brand|fonts|api\/gallery)\/|^\/favicon\.ico$/;

export async function onRequest({ request, next, env }) {
  const url = new URL(request.url);
  const onGalleries = GALLERY_HOST.test(url.hostname);
  if (!onGalleries && url.pathname.startsWith('/studio/')) {
    const area = areaOfPage(url.pathname);
    if (area) {
      const who = await signedIn(request, env).catch(() => false);
      const user = who && await accessFor(env.DB, who.email).catch(() => null);
      if (user && levelFor(user, area) === 'hidden') return Response.redirect(new URL('/studio?hidden=1', url).toString(), 302);
    }
    return next();
  }
  if (!onGalleries && !url.pathname.startsWith('/g/')) return next();
  if (onGalleries) {
    if (SHARED.test(url.pathname)) return next();
    if (url.pathname === '/robots.txt') return new Response('User-agent: *\nDisallow: /\n', { headers: { 'content-type': 'text/plain' } });
    if (url.pathname === '/' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/studio')) return Response.redirect('https://www.momentsinlight.co.nz/', 302);
  }
  const page = await env.ASSETS.fetch(new URL('/gallery-view', url));
  const res = new Response(page.body, page);
  res.headers.set('x-robots-tag', 'noindex, nofollow');
  res.headers.set('cache-control', 'no-cache');
  return res;
}
