// Step 2 of writing photo descriptions (alt text).
//
//   node scripts/alt-text/apply.mjs <manifest.json> <alt.json> [<alt.json> ...]
//
// <alt.json> files map photo ids from the manifest to descriptions: { "1": "…", "2": "…" }.
// Each description is written into the file the photo lives in: a blog post's gallery list
// or inline image, or an imported page's gallery or image block.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [manifestPath, ...altPaths] = process.argv.slice(2);
const photos = JSON.parse(readFileSync(manifestPath, 'utf8'));
const alts = Object.assign({}, ...altPaths.map((p) => JSON.parse(readFileSync(p, 'utf8'))));

const byFile = new Map();
for (const p of photos) if (alts[p.id]) (byFile.get(p.file) ?? byFile.set(p.file, []).get(p.file)).push(p);

let done = 0;
for (const [file, list] of byFile) {
  if (file.endsWith('.md')) {
    const path = join('src/content/blog', file);
    let t = readFileSync(path, 'utf8');
    for (const p of list) {
      const alt = alts[p.id].trim();
      if (p.where === 'gallery') {
        // Gallery entries are one JSON object per line; match on the photo's address.
        t = t.replace(/^  - (\{.*\})$/gm, (line, json) => {
          let g; try { g = JSON.parse(json); } catch { return line; }
          if (g.src.split('?')[0] !== p.src) return line;
          done++;
          return `  - ${JSON.stringify({ ...g, alt })}`;
        });
      } else {
        const esc = p.src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        t = t.replace(new RegExp(`!\\[[^\\]]*\\]\\((${esc}[^)\\s]*)\\)`, 'g'), (_, src) => { done++; return `![${alt.replace(/[[\]]/g, '')}](${src})`; });
      }
    }
    writeFileSync(path, t);
  } else {
    const path = join('src/data/pages', file);
    const d = JSON.parse(readFileSync(path, 'utf8'));
    for (const p of list) {
      const [, si, kind, i] = p.where.match(/^section(\d+)\.(images|blocks)\.(\d+)$/);
      const target = kind === 'images' ? d.sections[si].images[i] : d.sections[si].blocks[i].image;
      if (target.src.split('?')[0] === p.src) { target.alt = alts[p.id].trim(); done++; }
    }
    writeFileSync(path, JSON.stringify(d, null, 1));
  }
}
console.log(`wrote ${done} descriptions (${Object.keys(alts).length} supplied)`);
