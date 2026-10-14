// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import rehypeImages from './src/lib/rehype-images.mjs';

export default defineConfig({
  site: 'https://www.momentsinlight.co.nz',
  // Squarespace URLs have no trailing slash (/weddings, /blog/ellie-and-ryan-tui-hills).
  // 'file' output (weddings.html) lets Cloudflare Pages serve them at exactly those addresses.
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [sitemap()],
  markdown: { rehypePlugins: [rehypeImages] },
});
