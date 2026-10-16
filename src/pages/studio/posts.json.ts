// The studio's list of posts (every post, drafts and scheduled ones included) and the choices
// its menus offer. Built with the site; private, as /studio is behind Cloudflare Access.
import { getCollection } from 'astro:content';
import reviews from '../../data/reviews.json';
import { venues } from '../../data/venues';

export async function GET() {
  const posts = (await getCollection('blog'))
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf())
    .map((p) => ({
      id: p.id,
      title: p.data.title,
      date: p.data.date.toISOString().slice(0, 10),
      draft: p.data.draft,
      categories: p.data.categories,
      tags: p.data.tags,
      venue: p.data.venue ?? '',
      cover: p.data.thumbnail ?? p.data.gallery[0]?.src ?? '',
      coverPosition: p.data.thumbnailPosition ?? '',
      photos: p.data.gallery.length,
    }));
  const tags = [...new Set(posts.flatMap((p) => p.tags))].sort();
  return new Response(
    JSON.stringify({
      builtAt: new Date().toISOString(),
      posts,
      venues,
      tags,
      reviews: reviews.reviews.map((r) => ({ name: r.name, date: r.date, start: r.text.slice(0, 90) })),
    }),
    { headers: { 'content-type': 'application/json; charset=utf-8' } },
  );
}
