import { getCollection } from 'astro:content';

/** Posts per page on /blog, matching the live site. */
export const PAGE_SIZE = 20;

/** All posts, newest first. */
export async function sortedPosts() {
  return (await getCollection('blog')).sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}
