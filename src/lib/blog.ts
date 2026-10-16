import { getCollection } from 'astro:content';

/** Posts per page on /blog, matching the live site. */
export const PAGE_SIZE = 20;

/** All posts, newest first. */
export async function sortedPosts() {
  return (await getCollection('blog')).sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

/** A post's cover photo position as CSS object-position: Pages CMS presets, or an exact value. */
export function coverPosition(value?: string) {
  const presets: Record<string, string> = { top: '50% 0%', upper: '50% 25%', center: '50% 50%', lower: '50% 75%', bottom: '50% 100%' };
  return value ? presets[value] ?? value : undefined;
}

/** A post title split for cards: "Rebecca & Nick | Bridgewater Estate Wedding" becomes
 *  { name: "Rebecca & Nick", place: "Bridgewater Estate" }. Titles without a separator are
 *  left whole. */
export function storyName(title: string) {
  const [first, ...rest] = title.split(/\s+[|–—-]\s+/);
  return {
    name: first.replace(/\s+and\s+/i, ' & '),
    place: rest.join(' – ').replace(/\s+Wedding$/i, ''),
  };
}
