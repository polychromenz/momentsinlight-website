// The blog search index: every live post's names, place, tags and story words, fetched by the
// search box (BlogSearch.astro) the first time someone uses it.
import type { APIRoute } from 'astro';
import { sortedPosts, coverPosition, coverAlt, storyName } from '../../lib/blog';
import { sized } from '../../lib/images.mjs';

export const GET: APIRoute = async () => {
  const posts = (await sortedPosts()).map((p) => {
    const d = p.data;
    const wedding = d.categories.includes('Wedding');
    const { name, place } = wedding ? storyName(d.title) : { name: d.title, place: '' };
    const img = d.thumbnail ?? d.gallery[0]?.src;
    // The story's own words, without markdown, links or repeats, so the index stays small.
    const words = [...new Set((p.body ?? '').replace(/\]\([^)]*\)|<[^>]+>|https?:\/\/\S+/g, ' ').toLowerCase().match(/[a-zà-ÿāēīōū'’]{3,}/g) ?? [])].join(' ');
    return {
      id: p.id,
      name,
      place: place || d.venue || '',
      kind: wedding ? 'Love story' : d.categories.includes('Portrait') ? 'Portrait session' : d.categories.includes('Family') ? 'Family session' : 'Wedding planning',
      cats: d.categories,
      date: d.date.toISOString(),
      img: img ? sized(img, 750) : '',
      pos: coverPosition(d.thumbnailPosition) ?? '50% 50%',
      alt: coverAlt(d),
      text: [d.title, d.venue, d.description, d.tags.join(' '), words].filter(Boolean).join(' ').toLowerCase(),
    };
  });
  return new Response(JSON.stringify(posts), { headers: { 'content-type': 'application/json' } });
};
