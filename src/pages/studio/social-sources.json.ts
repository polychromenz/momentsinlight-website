// What the social drafts are made from (functions-lib/social.js): published blog posts with their
// photos, and the Google reviews. Built with the site; private, as /studio is behind Cloudflare Access.
import { getCollection } from 'astro:content';
import reviews from '../../data/reviews.json';

export async function GET() {
  const now = Date.now();
  const posts = (await getCollection('blog'))
    .filter((p) => !p.data.draft && p.data.date.valueOf() <= now)
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf())
    .map((p) => ({
      id: p.id,
      url: `/blog/${p.id}`,
      title: p.data.title,
      description: p.data.description ?? '',
      date: p.data.date.toISOString().slice(0, 10),
      venue: p.data.venue ?? '',
      categories: p.data.categories,
      review: p.data.review ?? '',
      photos: p.data.gallery.map((g) => ({ src: g.src, alt: g.alt ?? '', w: g.width ?? 0, h: g.height ?? 0 })),
    }));
  return new Response(
    JSON.stringify({
      posts,
      reviews: reviews.reviews.map((r) => ({ name: r.name, date: r.date, rating: r.rating, text: r.text, photos: (r.photos ?? []).map((g: any) => ({ src: g.src, alt: g.alt ?? '', w: g.width, h: g.height })) })),
    }),
    { headers: { 'content-type': 'application/json; charset=utf-8' } },
  );
}
