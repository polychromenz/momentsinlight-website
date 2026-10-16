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


/** Questions written as a bold line ("<p><strong>Question?</strong></p>") followed by answer
 *  paragraphs become open-and-close items. Returns the HTML and the questions and answers
 *  (for Google's FAQ listing). */
export const faqify = (h: string) => {
  const q = /<p>\s*<strong>([^<]+?)<\/strong>\s*<\/p>/g;
  const marks = [...h.matchAll(q)];
  if (marks.length < 2) return { html: h, items: [] as { q: string; a: string }[] };
  const before = h.slice(0, marks[0].index);
  const items = marks.map((m, i) => ({
    q: m[1].trim(),
    a: h.slice(m.index! + m[0].length, i + 1 < marks.length ? marks[i + 1].index : h.length).replace(/<p>\s*<\/p>/g, '').trim(),
  }));
  const html = `${before}<div class="faq-list">${items.map((it) => `<details><summary>${it.q}</summary><div class="answer">${it.a}</div></details>`).join('')}</div>`;
  return { html, items };
};

/** Steps written as a bold line ("<p><strong>You make an enquiry</strong></p>") followed by
 *  their text become a numbered timeline. */
export const stepify = (h: string) => {
  const q = /<p>\s*<strong>([^<]+?)<\/strong>\s*<\/p>/g;
  const marks = [...h.matchAll(q)];
  if (marks.length < 2) return h;
  const before = h.slice(0, marks[0].index);
  const steps = marks.map((m, i) => {
    const body = h.slice(m.index! + m[0].length, i + 1 < marks.length ? marks[i + 1].index : h.length).replace(/<p>\s*<\/p>/g, '').trim();
    return `<li class="step"><span class="step-n">${String(i + 1).padStart(2, '0')}</span><div class="step-body"><h3>${m[1].trim()}</h3>${body}</div></li>`;
  });
  return `${before}<ol class="steps">${steps.join('')}</ol>`;
};
