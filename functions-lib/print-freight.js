// Prints delivery (decided with Tony 2026-11-19). Each lab ships its own parcel, so an order with
// items from both labs pays both labs' freight.
//
// Seldex: their own published rates, passed on at cost (no markup), converted from A$ at the prints
// exchange rate. https://seldex.com.au/shipping-international and /shipping-australia, taken 2026-11-19.
//   New Zealand: A$25, or A$50 once Seldex's cost for the order is A$500 or more;
//                plus A$15 for a remote postcode (DHL's list below).
//   Australia:   Standard A$15 / Express A$25, or A$25 / A$35 once the order is over A$100. Remote
//                postcodes (A$10 to A$1,000, by suburb) aren't charged: Tony gets told instead.
//   Both:        plus A$15 once per order with a frame or canvas bigger than 20x24" (51x61 cm).
// "Order amount" is Seldex's cost to Tony (print_products.cost, A$), not what the couple pays.
//
// Atkins: Tony's own flat rates from the prints settings (paper / wall art), New Zealand only for now.
// In house (lab 'In house', 2026-11-19): Tony prints on his Canon PRO-10 (up to A3+) and posts them
// himself: one flat NZ rate (settings freight_inhouse), New Zealand only for now.
//
// Server only: it uses the labs' costs, which the gallery page never sees.
import { PAPER } from './print-pricing.js';
import { AU_REMOTE } from './seldex-au-remote.js';

export const SELDEX = {
  nz: { under: 25, over: 50, from: 500, remote: 15 },
  au: { standard: { under: 15, over: 25 }, express: { under: 25, over: 35 }, from: 100 },
  frame: 15, frameCm: [51, 61],
};
export const COUNTRIES = { NZ: 'New Zealand', AU: 'Australia' };

// DHL's New Zealand remote-area postcodes (list effective 10 Jan 2021, as Seldex links it).
const NZ_REMOTE_TEXT = `0170-0176 0178-0179 0181-0182 0184-0185 0192-0193 0272 0281-0283 0293-0295 0370-0374 0376-0377 0379 0381 0391
0472-0476 0478-0479 0481-0484 0486 0491-0492 0494 0496 0571 0573 0582-0583 0587-0589 0591-0594 0772 0782 0792-0794 0871
0873-0875 0881-0883 0891-0892 0972-0975 0977 0981-0986 0991 0994 1971 2471-2474
2681-2684 3072-3074 3076-3079 3081 3083 3096-3097 3177-3180 3182-3183 3186-3189 3191-3194 3196-3199 3281 3287 3295-3297
3373-3375 3377-3382 3384-3385 3391-3393 3471-3475 3481-3485 3491-3496 3576-3579 3581-3584 3591-3592 3597 3671-3674
3681-3682 3691 3771-3772 3781-3782 3784 3791-3794 3872-3883 3885-3886 3889 3894-3895 3970-3983 3985-3998 4071-4073 4075
4077-4079 4081-4082 4086-4087 4091 4094 4171-4172 4174-4175 4178-4184 4186 4188-4189 4191 4193 4195-4198 4272-4273 4275
4277-4279 4281-4285 4287-4288 4291-4295 4371-4374 4376-4379 4381 4383 4386-4393 4395-4399 4478-4479 4481 4571-4578
4581-4582 4584-4588 4591-4592 4597-4598 4672-4675 4681-4682 4691 4694 4696 4771 4774-4775 4777
4779-4789 4791-4797 4884 4891 4893-4894 4970-4979 4981-4999 5371-5373 5381 5391 5570-5575 5581-5583 5771-5773 5781-5784
5791-5792 5794 5871-5872 5881-5890 5894 6972 7071-7073 7077 7091 7095-7096 7173 7175 7178 7182-7183 7192-7198 7271-7276
7281-7282 7284-7285 7371 7373-7374 7379 7381-7385 7387 7391-7392 7395 7471-7473
7475-7477 7481-7483 7491 7495 7571-7572 7580-7583 7591 7670-7671 7675-7678 7681-7683 7691-7692 7771-7778 7781-7784 7791
7871-7873 7875 7881-7886 7891-7893 7895 7971-7975 7977-7980 7982-7988 7990-7992 8971-8972 9073-9074 9076-9077 9081-9082
9085 9091-9092 9271-9274 9281-9282 9291-9292 9371-9372 9376-9377 9382-9384 9386-9387 9391-9393 9395-9398 9471-9472 9481-9483
9491-9495 9498 9571-9572 9583-9587 9591 9593 9596-9598 9672 9679 9682-9683 9689 9691 9771-9779 9781-9783 9791-9794
9874-9877 9879 9881 9883-9884 9891-9893`;
const NZ_REMOTE = NZ_REMOTE_TEXT.split(/\s+/).filter(Boolean).map((r) => { const [a, b] = r.split('-').map(Number); return [a, b ?? a]; });

/** A 4-digit postcode, or '' (NZ and Australia both use 4 digits). */
export const cleanPostcode = (v) => { const m = String(v ?? '').match(/\d{4}/); return m ? m[0] : ''; };
export const nzRemote = (pc) => { const n = Number(pc); return !!pc && NZ_REMOTE.some(([a, b]) => n >= a && n <= b); };
/** Seldex's Australian remote surcharge range for a postcode ([lowest, highest] A$), or null. */
export const auRemote = (pc) => AU_REMOTE[pc] ?? null;

const isSeldex = (p) => /seldex/i.test(p?.lab ?? '');
export const isInHouse = (p) => /in.?house/i.test(p?.lab ?? '');
/** A frame or canvas bigger than 20x24" (Seldex's frame surcharge). */
const bigFrame = (p) => !PAPER.has(p.kind) && ((p.w_cm ?? 0) > SELDEX.frameCm[0] || (p.h_cm ?? 0) > SELDEX.frameCm[1]);

/** Where the order goes: { country: 'NZ' | 'AU', postcode, speed: 'standard' | 'express' }. */
export function cleanDest(d) {
  const country = COUNTRIES[d?.country] ? d.country : 'NZ';
  return { country, postcode: cleanPostcode(d?.postcode), speed: country === 'AU' && d?.speed === 'express' ? 'express' : 'standard' };
}

/** Delivery for an order. qtys: [{ p (product with cost), qty (prints of it) }]; s: prints settings;
 *  subtotal: what the prints cost the couple (for free-over). Returns
 *  { freight (NZ$ cents), parts: [{ lab, label, amount }], express (AU: the express total, for the choice),
 *    notes: [for Tony], error }. */
export function freightFor(qtys, s, dest, subtotal) {
  const d = cleanDest(dest);
  const lines = qtys.filter((x) => x.p && x.qty > 0);
  const seldex = lines.filter((x) => isSeldex(x.p)), home = lines.filter((x) => isInHouse(x.p));
  const atkins = lines.filter((x) => !isSeldex(x.p) && !isInHouse(x.p));
  const cents = (aud) => Math.round(aud * (Number(s.rate) || 1) * 100);
  const notes = [];
  let error = '';
  if (d.country !== 'NZ' && (atkins.length || home.length)) error = `Some of these prints can only be delivered within New Zealand for now. To send to ${COUNTRIES[d.country]}, please remove them or get in touch with Tony.`;

  const parts = [];
  if (home.length) parts.push({ lab: 'In house', label: 'Tracked post', amount: s.freight_inhouse ?? 1000 });
  if (atkins.length) {
    const wall = atkins.some((x) => !PAPER.has(x.p.kind));
    parts.push({ lab: 'Atkins', label: wall ? 'Wall art' : 'Prints', amount: wall ? s.freight_wall : s.freight_prints });
  }
  let express = null;
  if (seldex.length) {
    const cost = seldex.reduce((a, x) => a + (Number(x.p.cost) || 0) * x.qty, 0); // A$
    const frame = seldex.some((x) => bigFrame(x.p)) ? SELDEX.frame : 0;
    if (d.country === 'AU') {
      const band = cost > SELDEX.au.from ? 'over' : 'under';
      const std = SELDEX.au.standard[band] + frame, exp = SELDEX.au.express[band] + frame;
      parts.push({ lab: 'Seldex', label: d.speed === 'express' ? 'Express' : 'Standard', amount: cents(d.speed === 'express' ? exp : std) });
      express = { standard: cents(std), express: cents(exp) };
      const r = auRemote(d.postcode);
      if (r) notes.push(`Postcode ${d.postcode} is on Seldex’s remote list (A$${r[0]}${r[1] !== r[0] ? `–${r[1]}` : ''} extra, by suburb). It wasn’t charged: check with Seldex.`);
    } else {
      const remote = nzRemote(d.postcode) ? SELDEX.nz.remote : 0;
      parts.push({ lab: 'Seldex', label: remote ? 'Rural / remote' : 'Courier', amount: cents((cost >= SELDEX.nz.from ? SELDEX.nz.over : SELDEX.nz.under) + remote + frame) });
    }
    if (frame) parts[parts.length - 1].label += ', large frame';
  }
  const free = s.free_over > 0 && subtotal >= s.free_over;
  if (free) parts.forEach((x) => { x.amount = 0; });
  if (free && express) express = { standard: 0, express: 0 };
  return { freight: parts.reduce((a, x) => a + x.amount, 0), parts, express, free, notes, error, dest: d };
}

/** After payment: the address Stripe took against the postcode the freight was worked out on. */
export function postcodeCheck(dest, address) {
  const d = cleanDest(dest);
  const pc = cleanPostcode(address?.postal_code);
  if (!pc || pc === d.postcode) return null;
  if (d.country === 'NZ' && nzRemote(pc) !== nzRemote(d.postcode)) return `Delivery was worked out for postcode ${d.postcode || '(none)'}, but the address is ${pc}${nzRemote(pc) ? ', which is on Seldex’s remote list (A$15 more)' : ', which isn’t remote'}.`;
  if (d.country === 'AU' && auRemote(pc)) return `The address postcode ${pc} is on Seldex’s remote list (A$${auRemote(pc).join('–')} extra, by suburb). It wasn’t charged: check with Seldex.`;
  return null;
}
