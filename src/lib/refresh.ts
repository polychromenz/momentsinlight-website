// Helpers for RefreshedPage.astro: tidy imported Squarespace text for the refreshed design.

/** Plain text from a piece of HTML. */
export const strip = (h: string) => h.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
/** Remove Squarespace’s inline alignment and colour wrappers; mark short price lines. */
export const clean = (h: string) =>
  h
    .replace(/\s*style="text-align:\s*[a-z]+;?"/g, '')
    .replace(/<span class="sqsrte-[^"]*">([\s\S]*?)<\/span>/g, '$1')
    .replace(/<p>(\s|&nbsp;|<br>)*<\/p>/g, '')
    // A short line with a price ("From $600 NZD", "All for just $1995") stands out.
    .replace(/<p>((?:<strong>)?[^<]{0,40}\$\s?[\d,]+[^<]{0,24}(?:<\/strong>)?)<\/p>/g, '<p class="price-line">$1</p>');

// Two or more "### headings" in one section are laid out side by side as cards; a price
// line after the last card belongs to them all, so it moves out underneath.
export const cardify = (h: string) => {
  const parts = h.split(/(?=<h3[ >])/);
  if (parts.length < 3) return h;
  const [before, ...cards] = parts;
  let last = cards.pop()!;
  const tail = last.match(/(<p class="price-line">[\s\S]*?<\/p>\s*)+$/)?.[0] ?? '';
  last = last.slice(0, last.length - tail.length);
  return `${before}<div class="cards">${[...cards, last].map((c) => `<div class="card">${c}</div>`).join('')}</div>${tail}`;
};

