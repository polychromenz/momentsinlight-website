// Corrections to Tony's three contracts (from his Studio Ninja export), applied as an exact list
// so every change can be checked. Writes the corrected contracts and a before/after review page.
//
//   node scripts/contract-fixes.mjs <folder with the exported contracts> <output folder>
//
// Only clear errors are fixed (a wrong clause reference, grammar, spelling, consistent terms);
// nothing changes what the contracts mean. Each change has its reason, shown on the review page.
import fs from 'node:fs';
import path from 'node:path';

const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error('Usage: node scripts/contract-fixes.mjs <contracts folder> <output folder>'); process.exit(1); }

// [before, after, reason]. Each "before" must appear exactly once (checked below).
const WEDDING = [
  ['%business_name% ("Photographer")', 'Moments in Light ("Photographer")', 'Studio Ninja’s fill-in for your business name, written out.'],
  ['any specific images requested by client', 'any specific images requested by Client', '“Client” is a defined term and is capitalised everywhere else.'],
  ['force majeure events, see Section 11)', 'force majeure events, see clause 10)', 'Force majeure is clause 10, not 11 (11 is Jurisdiction).'],
  ['(including the aforementioned retainer)', '(including the aforementioned deposit)', 'This clause calls it a “deposit”; “retainer” means the same thing. One word throughout avoids any doubt.'],
  ['(eg. wall hangings at home, facebook, blogs)', '(e.g. wall hangings at home, Facebook, blogs)', 'Spelling: “e.g.” and “Facebook”.'],
  ['Photographer retains Copyright in all images', 'Photographer retains copyright in all images', '“copyright” isn’t a defined term (lower case elsewhere in the clause).'],
  ['at least 7 Days in advance', 'at least 7 days in advance', '“days” isn’t a defined term.'],
  ['and notice is not given the period specified above', 'and notice is not given within the period specified above', 'Missing word: “within”.'],
  ['shall be entitled to the retainer amount as liquidated damages', 'shall be entitled to the deposit as liquidated damages', '“deposit”, as in clause 2.'],
  ['The retainer amount will need to be repaid upon booking the new date', 'A new deposit will need to be paid upon booking the new date', '“deposit”, as in clause 2. “Repaid” could be read as you paying it back; this says what’s meant (they pay a deposit again for the new date). Please check this one.'],
  ['payment of the retainer, Photographer shall commit', 'payment of the deposit, Photographer shall commit', '“deposit”, as in clause 2.'],
  ['valid for a period of 6 Months following the Event', 'valid for a period of 6 months following the Event', '“months” isn’t a defined term.'],
  ['(including any retainer), and this Agreement', '(including any deposit), and this Agreement', '“deposit”, as in clause 2.'],
  ['both parties here to consent', 'both parties hereto consent', 'Spelling: “hereto” is one word.'],
  ['or the Services performed there under,', 'or the Services performed thereunder,', 'Spelling: “thereunder” is one word.'],
  ['recover reasonable solicitors fees,', 'recover reasonable solicitors’ fees,', 'Apostrophe: the solicitors’ fees.'],
  ['from such litigation or dispute from non-prevailing party.', 'from such litigation or dispute from the non-prevailing party.', 'Missing word: “the”.'],
  ['and to hold Photographer harmless', 'and agrees to hold Photographer harmless', 'Grammar: “acknowledges … and agrees to hold … harmless” (as written, nothing says the Client agrees).'],
  ['until such time as the Album/Images are delivered', 'until such time as the Album/images are delivered', 'Matches “Album/images” in the next sentence.'],
];
const NO_ADS_20 = [['for their wedding gallery page web page on the understanding', 'on Photographer’s wedding gallery web page on the understanding', '“their wedding gallery page web page” repeats “page” and reads as the couple’s page; it means your website’s gallery page.']];
const NZIPP = [
  ['2.1Except as may be expressly provided', '2.1 Except as may be expressly provided', 'Missing space after the clause number.'],
  ['including attribution rights, in respect\n\nof the Photographic Works', 'including attribution rights, in respect of the Photographic Works', 'A line break in the middle of the sentence (from copying); joined back up.'],
];

const files = [
  { file: 'wedding contract.md', name: 'Wedding contract', fixes: WEDDING },
  { file: 'wedding contract no ads.md', name: 'Wedding contract (no ads)', fixes: [...WEDDING, ...NO_ADS_20] },
  { file: 'nzipp contract.md', name: 'NZIPP terms', fixes: NZIPP },
];

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const clauseOf = (text, at) => text.slice(0, at).match(/\*\*(\d+)(?:\.|\s)[^*]*\*\*(?![\s\S]*\*\*\d+(?:\.|\s))/)?.[1] ?? '';
fs.mkdirSync(out, { recursive: true });
const sections = [];
for (const c of files) {
  const before = fs.readFileSync(path.join(src, c.file), 'utf8').replace(/\r\n/g, '\n');
  let after = before;
  const rows = [];
  for (const [a, b, why] of c.fixes) {
    const n = after.split(a).length - 1;
    if (n !== 1) throw new Error(`${c.file}: “${a.slice(0, 50)}” found ${n} times (expected once)`);
    const at = after.indexOf(a);
    // Show the whole sentence around the change, before and after.
    const start = Math.max(after.lastIndexOf('. ', at) + 2, after.lastIndexOf('\n', at) + 1, 0);
    const endA = after.indexOf('.', at + a.length);
    const sentence = after.slice(start, endA < 0 ? undefined : endA + 1);
    rows.push({ clause: clauseOf(after, at), why, before: sentence, after: sentence.replace(a, b), a, b });
    after = after.replace(a, b);
  }
  fs.writeFileSync(path.join(out, c.file.replace('.md', ' (corrected).md')), after);
  sections.push({ ...c, rows });
}

const mark = (sentence, find, cls) => esc(sentence).replace(esc(find), `<mark class="${cls}">${esc(find)}</mark>`).replace(/\*\*/g, '').replace(/\n+/g, ' ');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Contract corrections to check</title>
<style>
  body { margin: 0; padding: 28px 16px 60px; background: #f6f1ea; font-family: Raleway, 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; }
  main { max-width: 1100px; margin: 0 auto; }
  h1 { font-weight: 300; font-size: 32px; margin: 0 0 6px; }
  h2 { font-weight: 400; font-size: 24px; margin: 36px 0 10px; }
  .lead { color: #444; line-height: 1.6; max-width: 75ch; }
  .change { background: #fff; border-radius: 20px 0; padding: 16px 20px; margin: 12px 0; }
  .why { margin: 0 0 10px; font-size: 14px; color: #3e4229; }
  .why b { font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: #5a5e3b; margin-right: 6px; }
  .cols { display: grid; gap: 12px; }
  .cols div { font-size: 15px; line-height: 1.6; padding: 10px 12px; border-radius: 10px 0; }
  .cols .b { background: #fbeee8; } .cols .a { background: #eef1e4; }
  .cols span { display: block; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #777; margin-bottom: 4px; }
  mark.del { background: #f3c2b4; text-decoration: line-through; } mark.ins { background: #c9d9a5; }
  .check { background: #fff4d6; border: 1px solid #e0c46c; }
  @media (min-width: 800px) { .cols { grid-template-columns: 1fr 1fr; } }
</style></head><body><main>
<h1>Contract corrections to check</h1>
<p class="lead">Every change to your contracts, with the sentence before (red) and after (green), and why. Only errors are fixed: a wrong clause reference, grammar, spelling and consistent wording. Nothing changes what the contracts mean. One change is marked <strong>please check</strong> because it clarifies wording. Nothing is used until you approve it.</p>
${sections.map((c) => `<h2>${esc(c.name)} <small style="font-size:15px;color:#777">(${c.rows.length} changes)</small></h2>
${c.rows.map((r) => `<div class="change${/check/i.test(r.why) ? ' check' : ''}"><p class="why"><b>${r.clause ? `Clause ${esc(r.clause)}` : 'Opening'}</b>${esc(r.why)}</p>
<div class="cols"><div class="b"><span>Before</span>${mark(r.before, r.a, 'del')}</div><div class="a"><span>After</span>${mark(r.after, r.b, 'ins')}</div></div></div>`).join('')}`).join('')}
</main></body></html>`;
fs.writeFileSync(path.join(out, 'contract-corrections.html'), html);
console.log(sections.map((c) => `${c.name}: ${c.rows.length} changes`).join('\n'));
