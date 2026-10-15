// Rehype plugin for photos placed inside Markdown posts: lazy-load them and give them a
// responsive srcset like the Img component does.
import { responsive } from './images.mjs';

export default function rehypeImages() {
  const visit = (node) => {
    if (node.type === 'element' && node.tagName === 'img') {
      const p = node.properties;
      p.loading ??= 'lazy';
      p.decoding ??= 'async';
      if (!p.srcSet) {
        const img = responsive(String(p.src || ''));
        if (img.srcset) {
          p.src = img.src;
          p.srcSet = img.srcset;
          p.sizes = '(min-width: 768px) 68vw, 100vw';
        }
      }
    }
    node.children?.forEach(visit);
  };
  return (tree) => visit(tree);
}
