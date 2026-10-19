// Google address lookup and driving distances (docs: Studio money plan, Oct 2026). One server-side
// key, the Cloudflare secret GOOGLE_MAPS_KEY, with the Places API (New) and Routes API enabled.
// Without the key everything here quietly returns nothing, so address boxes work as plain text.
//   suggest()   addresses and places in New Zealand matching what's been typed
//   details()   the chosen one's name, full address and position
//   drivingKm() one-way driving distance between two addresses (cached in mileage_places)
const PLACES = 'https://places.googleapis.com/v1';

export const mapsReady = (env) => !!env.GOOGLE_MAPS_KEY;

/** Up to 5 suggestions: [{ id, main, rest, text }]. `session` groups one person's typing into one lookup. */
export async function suggest(env, input, session) {
  const q = String(input ?? '').trim().slice(0, 120);
  if (!mapsReady(env) || q.length < 3) return [];
  const r = await fetch(`${PLACES}/places:autocomplete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': env.GOOGLE_MAPS_KEY },
    body: JSON.stringify({ input: q, sessionToken: cleanSession(session), includedRegionCodes: ['nz'], languageCode: 'en-NZ', regionCode: 'nz' }),
  });
  if (!r.ok) { console.error('places: suggest', r.status, (await r.text()).slice(0, 300)); return []; }
  const d = await r.json();
  return (d.suggestions ?? []).map((s) => s.placePrediction).filter(Boolean).slice(0, 5).map((p) => ({
    id: p.placeId, text: p.text?.text ?? '', main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '', rest: p.structuredFormat?.secondaryText?.text ?? '',
  }));
}

/** The chosen place: { id, name, address, lat, lng, business } (business = a named place, e.g. a venue). */
export async function details(env, id, session) {
  if (!mapsReady(env) || !/^[\w-]{10,300}$/.test(String(id ?? ''))) return null;
  const s = cleanSession(session);
  const r = await fetch(`${PLACES}/places/${encodeURIComponent(id)}?languageCode=en-NZ&regionCode=nz${s ? `&sessionToken=${s}` : ''}`, {
    headers: { 'X-Goog-Api-Key': env.GOOGLE_MAPS_KEY, 'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,types' },
  });
  if (!r.ok) { console.error('places: details', r.status, (await r.text()).slice(0, 300)); return null; }
  const p = await r.json();
  const address = String(p.formattedAddress ?? '').replace(/, New Zealand$/, '');
  const name = p.displayName?.text ?? '';
  const street = (p.types ?? []).some((t) => ['street_address', 'premise', 'subpremise', 'route'].includes(t));
  return { id: p.id, name, address, lat: p.location?.latitude ?? null, lng: p.location?.longitude ?? null, business: !street && !!name && !address.startsWith(name) };
}

/** One-way driving km from one address to another (NZ), or null if Google can't find a route. */
export async function drivingKm(env, from, to) {
  const a = String(from ?? '').trim(), b = String(to ?? '').trim();
  if (!mapsReady(env) || !a || !b) return null;
  const key = `${a.toLowerCase()} -> ${b.toLowerCase()}`;
  const have = await env.DB.prepare('SELECT km FROM mileage_places WHERE route = ?1').bind(key).first();
  if (have) return have.km;
  const nz = (s) => (/new zealand|\bnz\b/i.test(s) ? s : `${s}, New Zealand`);
  const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': env.GOOGLE_MAPS_KEY, 'X-Goog-FieldMask': 'routes.distanceMeters' },
    body: JSON.stringify({ origin: { address: nz(a) }, destination: { address: nz(b) }, travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE', regionCode: 'nz', units: 'METRIC' }),
  });
  if (!r.ok) { console.error('places: route', r.status, (await r.text()).slice(0, 300)); return null; }
  const m = (await r.json()).routes?.[0]?.distanceMeters;
  if (!m) return null;
  const km = Math.round(m / 100) / 10;
  await env.DB.prepare('INSERT OR REPLACE INTO mileage_places (route, km, created_at) VALUES (?1, ?2, ?3)').bind(key, km, new Date().toISOString()).run();
  return km;
}

const cleanSession = (s) => (/^[\w-]{8,64}$/.test(String(s ?? '')) ? String(s) : undefined);
