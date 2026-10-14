import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Wedding blog posts: one Markdown file per post in src/content/blog.
// The file name is the URL slug, e.g. ellie-and-ryan-tui-hills.md -> /blog/ellie-and-ryan-tui-hills
const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    seoTitle: z.string().optional(),
    description: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    author: z.string().default('Tony Gorham'),
    venue: z.string().optional(),
    venueUrl: z.string().url().optional(),
    categories: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    // Image used for the post on blog listings and when shared on social media.
    thumbnail: z.string().optional(),
    // Width and height are optional so photos added through Pages CMS work without them;
    // when present they reserve space while lazy images load, so the page doesn't jump.
    gallery: z
      .array(
        z.object({
          src: z.string(),
          alt: z.string().default(''),
          width: z.number().optional(),
          height: z.number().optional(),
        }),
      )
      .default([]),
    // Previous/next links to posts that haven't been converted yet.
    prev: z.object({ title: z.string(), href: z.string() }).optional(),
    next: z.object({ title: z.string(), href: z.string() }).optional(),
  }),
});

// Pages built in Pages CMS from reusable sections: one Markdown file per page in
// src/content/pages, with everything in the front matter. The page's address comes from its
// `slug` field (not the file name), so it can be changed in the CMS at any time.
const image = z.object({ src: z.string(), alt: z.string().default('') });
const background = z.enum(['white', 'alt']).default('white');
const html = z.string().default('');

const section = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hero'),
    image,
    heading: z.string(),
    subheading: z.string().optional(),
    height: z.enum(['tall', 'short']).default('tall'),
    buttonLabel: z.string().optional(),
    buttonLink: z.string().optional(),
  }),
  z.object({
    type: z.literal('text'),
    heading: z.string().optional(),
    body: html,
    align: z.enum(['left', 'center']).default('left'),
    background,
  }),
  z.object({
    type: z.literal('imageText'),
    image,
    heading: z.string().optional(),
    body: html,
    imageSide: z.enum(['left', 'right']).default('left'),
    background,
  }),
  z.object({
    type: z.literal('gallery'),
    heading: z.string().optional(),
    layout: z.enum(['grid', 'masonry', 'carousel']).default('grid'),
    images: z.array(image).default([]),
    background,
  }),
  z.object({
    type: z.literal('testimonial'),
    quote: z.string(),
    name: z.string(),
    detail: z.string().optional(),
    background,
  }),
  z.object({
    type: z.literal('cta'),
    heading: z.string().optional(),
    text: z.string().optional(),
    buttonLabel: z.string(),
    buttonLink: z.string(),
    background,
  }),
]);

const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    // Address of the page, e.g. "maternity-portraits" -> /maternity-portraits.
    // Lowercase letters, numbers and hyphens; "/" makes a sub-page, e.g. "venues/example".
    slug: z
      .string()
      .transform((s) => s.trim().replace(/^\/+|\/+$/g, '').toLowerCase())
      .refine((s) => /^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*$/.test(s), {
        message: 'The page address can only use lowercase letters, numbers, hyphens and "/" (e.g. "maternity-portraits")',
      }),
    seoTitle: z.string().optional(),
    description: z.string(),
    shareImage: z.string().optional(),
    // Drafts only appear when previewing locally (npm run dev), never on the live site.
    draft: z.boolean().default(false),
    sections: z.array(section).default([]),
  }),
});

export const collections = { blog, pages };
