import { getCollection } from 'astro:content';

/** Posts per page on /blog, matching the live site. */
export const PAGE_SIZE = 20;

/** Whether a post belongs on the site: not a draft, and its date has arrived (so a post dated
 *  in the future is scheduled: it appears with the first build on or after that day). Local
 *  previews (npm run dev) show everything. */
export const isLive = (p: { data: { draft?: boolean; date: Date } }) =>
  import.meta.env.DEV || (!p.data.draft && p.data.date.valueOf() <= Date.now());

/** All live posts, newest first. */
export async function sortedPosts() {
  return (await getCollection('blog', isLive)).sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

/** A post's cover photo position as CSS object-position: Pages CMS presets, or an exact value. */
export function coverPosition(value?: string) {
  const presets: Record<string, string> = { top: '50% 0%', upper: '50% 25%', center: '50% 50%', lower: '50% 75%', bottom: '50% 100%' };
  return value ? presets[value] ?? value : undefined;
}

/** The cover photo's description: its own, or the matching gallery photo's. */
export function coverAlt(d: { thumbnail?: string; thumbnailAlt?: string; gallery: { src: string; alt: string }[] }) {
  if (d.thumbnailAlt) return d.thumbnailAlt;
  const cover = d.thumbnail ?? d.gallery[0]?.src;
  const key = (u?: string) => String(u ?? '').replace(/\/(public(\.webp)?|w=[^/]*)$/, '');
  return d.gallery.find((g) => key(g.src) === key(cover))?.alt ?? '';
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

/** Photos for a venue slideshow from the love stories with a tag, newest wedding first, taking
 *  one photo from each wedding in turn so every couple appears early on. */
export async function photosFromTag(tag: string, limit = 30) {
  const posts = (await sortedPosts()).filter((p) => p.data.tags.includes(tag));
  const lists = posts.map((p) => p.data.gallery.filter((g) => g.width && g.height));
  const picked: { src: string; alt: string; width?: number; height?: number }[] = [];
  for (let n = 0; picked.length < limit && lists.some((l) => l[n]); n++) {
    for (const l of lists) if (l[n] && picked.length < limit) picked.push(l[n]);
  }
  return picked;
}
