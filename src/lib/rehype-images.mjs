// Rehype plugin for photos placed inside Markdown posts: lazy-load them and, while images
// are still hosted on Squarespace, give them a responsive srcset like the Img component does.
const WIDTHS = [500, 750, 1000, 1500, 2500];

export default function rehypeImages() {
  const visit = (node) => {
    if (node.type === 'element' && node.tagName === 'img') {
      const p = node.properties;
      p.loading ??= 'lazy';
      p.decoding ??= 'async';
      const src = String(p.src || '');
      if (src.includes('squarespace-cdn.com') && !p.srcSet) {
        const base = src.split('?')[0];
        p.src = `${base}?format=1500w`;
        p.srcSet = WIDTHS.map((w) => `${base}?format=${w}w ${w}w`).join(', ');
        p.sizes = '(min-width: 768px) 68vw, 100vw';
      }
    }
    node.children?.forEach(visit);
  };
  return (tree) => visit(tree);
}
