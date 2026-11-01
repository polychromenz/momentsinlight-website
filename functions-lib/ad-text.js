// Shared by the new-enquiry alert (enquiry.js) and the client page (src/pages/studio/crm/job.astro).
/** Which Google ad keyword brought an enquiry, in words (jobs.ad_click is JSON). */
export function adText(json) {
  let a;
  try { a = typeof json === 'string' ? JSON.parse(json) : json; } catch { return ''; }
  if (!a) return '';
  const match = { e: 'exact', p: 'phrase', b: 'broad' }[String(a.match).toLowerCase()] || '';
  return `${a.term ? `keyword “${a.term}”${match ? ` (${match})` : ''}` : 'a Google ad (keyword not known)'}${a.page ? `, landed on ${a.page}` : ''}`;
}
