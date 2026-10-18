// Client galleries live at galleries.momentsinlight.co.nz/{slug} (and momentsinlight.co.nz/g/{slug},
// which the studio uses for previews). Both show the one gallery page (src/pages/gallery-view.astro),
// which reads the slug from the address. Everything else on the website passes straight through.
const GALLERY_HOST = /^galleries\./;
const SHARED = /^\/(_astro|brand|fonts|api\/gallery)\/|^\/favicon\.ico$/;

export async function onRequest({ request, next, env }) {
  const url = new URL(request.url);
  const onGalleries = GALLERY_HOST.test(url.hostname);
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
