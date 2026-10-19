// The studio's areas, for per-person access (Settings > People, functions-lib/people.js). Each person
// other than Tony has, for each area: 'hidden' (not in their menu, pages and data refused),
// 'look' (they can open it but not change anything) or 'change'. The dashboard is always open.
// Used by the server (functions/api/studio/_middleware.js, functions/_middleware.js) and the
// studio's pages (src/layouts/StudioLayout.astro), so the map lives here once.
export const AREAS = {
  clients: 'Clients, calendar and contacts',
  payments: 'Payments, mileage, Xero and reports',
  galleries: 'Galleries',
  social: 'Social',
  website: 'Website (blog, pages, menu, reviews)',
  seo: 'SEO, rankings and stats',
  ads: 'Google Ads',
  settings: 'Settings',
};
export const LEVELS = { hidden: 'Hidden', look: 'Look only', change: 'Can change' };

// Most specific first.
const API = [
  [/^\/api\/studio\/crm\/(settings|send-mode|sn-gmail|gmail-connect|gmail-callback|gmail-test|digest)\b/, 'settings'],
  [/^\/api\/studio\/(booking|people)\b/, 'settings'],
  [/^\/api\/studio\/crm\/(invoice|payments)\b/, 'payments'],
  [/^\/api\/studio\/(mileage|xero|reports)\b/, 'payments'],
  [/^\/api\/studio\/crm\/ads\b|^\/api\/studio\/ads\//, 'ads'],
  [/^\/api\/studio\/crm\/(seo|rankings)\b|^\/api\/studio\/(seo|stats)\b/, 'seo'],
  [/^\/api\/studio\/crm\/(dashboard|today|tasks)\b/, null],
  [/^\/api\/studio\/crm\//, 'clients'],
  [/^\/api\/studio\/galleries\/insights\b/, null],
  [/^\/api\/studio\/galleries\b/, 'galleries'],
  [/^\/api\/studio\/social\b/, 'social'],
  [/^\/api\/studio\/(post|page|menu|reviews|upload|describe)\b/, 'website'],
];
const PAGES = [
  [/^\/studio\/crm\/settings\b/, 'settings'],
  [/^\/studio\/seo\/ads\b/, 'ads'],
  [/^\/studio\/(crm|calendar|contacts)\b/, 'clients'],
  [/^\/studio\/(payments|mileage|xero|reports)\b/, 'payments'],
  [/^\/studio\/(galleries|gallery)\b/, 'galleries'],
  [/^\/studio\/social\b/, 'social'],
  [/^\/studio\/(blog|edit|pages|page-edit|page-write|home-edit|menu|reviews|posts\.json)\b/, 'website'],
  [/^\/studio\/(seo|rankings|stats)\b/, 'seo'],
];
const find = (list, path) => { for (const [re, a] of list) if (re.test(path)) return a; return null; };
/** Which area an API address belongs to (null = open to everyone signed in, e.g. the dashboard). */
export const areaOfApi = (path) => find(API, path);
/** Which area a studio page belongs to (null = the home page and the like). */
export const areaOfPage = (path) => find(PAGES, path);

/** A person's level in an area: owners can change everything; unknown areas are look-only. */
export function levelFor(user, area) {
  if (!user || user.access === 'owner' || !area) return 'change';
  return user.areas?.[area] ?? 'look';
}
