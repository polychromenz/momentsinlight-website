// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import rehypeImages from './src/lib/rehype-images.mjs';

export default defineConfig({
  site: 'https://www.momentsinlight.co.nz',
  // Squarespace URLs have no trailing slash (/weddings, /blog/ellie-and-ryan-tui-hills).
  // 'file' output (weddings.html) lets Cloudflare Pages serve them at exactly those addresses.
  trailingSlash: 'never',
  // Styles go inside each page rather than a separate file the browser must fetch before it
  // can draw anything (they're small: ~20KB uncompressed).
  build: { format: 'file', inlineStylesheets: 'always' },
  // The studio (the private post editor) and pages being tested stay out of the sitemap.
  integrations: [sitemap({ filter: (page) => !page.includes('/studio') && !page.includes('/newcontact') && !page.endsWith('/quote') && !page.endsWith('/quote/') })],
  markdown: { rehypePlugins: [rehypeImages] },
});
