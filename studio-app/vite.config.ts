import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// The studio's own email editor (../src/studio/rich-editor.ts, with the Button and Gallery button
// tools) is shared with the website, so Vite may read files from the website folder too.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { port: 5174, strictPort: true, fs: { allow: ['..'] } },
});
