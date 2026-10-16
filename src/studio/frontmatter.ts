// Reading and writing a post file: the settings block at the top (front matter) and the story.
// Written in the same style as the existing posts (quoted strings, one photo per line), so a
// post saved from the studio looks like one written by hand.
import yaml from 'js-yaml';

export type Photo = { src: string; alt: string; width?: number; height?: number };
export type PostData = {
  title: string;
  seoTitle?: string;
  description: string;
  date: string; // YYYY-MM-DD
  updated?: string;
  author: string;
  venue?: string;
  venueUrl?: string;
  categories: string[];
  tags: string[];
  review?: string;
  draft: boolean;
  thumbnail?: string;
  thumbnailPosition?: string;
  opening?: 'photo' | 'text';
  galleryStyle?: 'story' | 'columns' | 'slideshow';
  gallery: Photo[];
  [other: string]: unknown;
};

const ORDER = ['title', 'seoTitle', 'description', 'date', 'updated', 'author', 'venue', 'venueUrl', 'categories', 'tags', 'review', 'draft', 'thumbnail', 'thumbnailPosition', 'opening', 'galleryStyle', 'gallery'];

const day = (v: unknown) => {
  if (!v) return undefined;
  const d = v instanceof Date ? v : new Date(String(v));
  return isNaN(d.valueOf()) ? undefined : d.toISOString().slice(0, 10);
};

export function parsePost(text: string): { data: PostData; body: string } {
  const m = text.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const raw = (m ? yaml.load(m[1]) : {}) as Record<string, unknown>;
  const data: PostData = {
    ...raw,
    title: String(raw.title ?? ''),
    description: String(raw.description ?? ''),
    date: day(raw.date) ?? new Date().toISOString().slice(0, 10),
    updated: day(raw.updated),
    author: String(raw.author ?? 'Tony Gorham'),
    categories: (raw.categories as string[]) ?? [],
    tags: (raw.tags as string[]) ?? [],
    draft: raw.draft === true,
    gallery: ((raw.gallery as Photo[]) ?? []).map((g) => ({ src: g.src, alt: g.alt ?? '', width: g.width, height: g.height })),
  } as PostData;
  return { data, body: (m ? m[2] : text).replace(/^\n+/, '') };
}

const str = (v: string) => JSON.stringify(v);

export function writePost(data: PostData, body: string): string {
  const lines: string[] = ['---'];
  const keys = [...ORDER, ...Object.keys(data).filter((k) => !ORDER.includes(k))];
  for (const k of keys) {
    const v = data[k];
    if (v === undefined || v === null || v === '') continue;
    if (k === 'draft') { if (v) lines.push('draft: true'); continue; }
    if (k === 'date' || k === 'updated') { lines.push(`${k}: ${v}`); continue; }
    if (k === 'gallery') {
      const photos = v as Photo[];
      if (!photos.length) continue;
      lines.push('gallery:');
      for (const g of photos) {
        const o: Record<string, unknown> = { src: g.src, alt: g.alt ?? '' };
        if (g.width && g.height) { o.width = g.width; o.height = g.height; }
        lines.push(`  - ${JSON.stringify(o)}`);
      }
      continue;
    }
    if (Array.isArray(v)) { lines.push(`${k}: ${JSON.stringify(v)}`); continue; }
    if (typeof v === 'string') { lines.push(`${k}: ${str(v)}`); continue; }
    if (typeof v === 'number' || typeof v === 'boolean') { lines.push(`${k}: ${v}`); continue; }
    // Anything else (e.g. prev/next links): written as YAML.
    lines.push(yaml.dump({ [k]: v }, { lineWidth: -1, flowLevel: 1 }).trimEnd());
  }
  lines.push('---', '');
  return lines.join('\n') + body.trim() + '\n';
}

/** A post address from its title: "Ellie & Ryan | Tui Hills" -> "ellie-and-ryan-tui-hills". */
export const slugify = (s: string) =>
  s.toLowerCase().replace(/&/g, ' and ').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
