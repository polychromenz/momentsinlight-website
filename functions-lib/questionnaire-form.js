// Questionnaires: the question types, and drawing a questionnaire as a form (the couple's page
// /questionnaire, the Settings preview, and Tony's view of their answers). No imports, so it runs
// in the browser and in Pages Functions alike.
//
// A question: { id, type, label, placeholder?, options?: [..], required?, half?, fill? }
//   heading   a section title (label)            text     a paragraph of text (label)
//   short     one line                            long     a few lines
//   select    a drop-down (options)               radio    pick one (options)
//   checks    tick any (options)                  file     photos or PDFs (up to 10 MB each)
// half: sits beside the next half-width question. fill: filled in from their booking to start
// with (first_name, partner_name, email, phone, venue).

export const TYPES = {
  heading: 'Heading', text: 'Text', short: 'Short answer', long: 'Long answer',
  select: 'Drop-down', radio: 'Pick one', checks: 'Tick any', file: 'Photo or file upload',
};
export const FILLS = { first_name: 'Their first name', partner_name: 'Partner’s name', email: 'Their email', phone: 'Their phone', venue: 'Venue' };
export const ASKS = (q) => !['heading', 'text'].includes(q.type);
export const MAX_UPLOAD = 10 * 1024 * 1024;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const size = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Whether an answer counts as given. */
export const answered = (q, v) => (Array.isArray(v) ? v.length > 0 : String(v ?? '').trim() !== '');

/** The questions still needing an answer (required ones left empty). */
export const missing = (questions, answers) => questions.filter((q) => ASKS(q) && q.required && !answered(q, answers[q.id]));

/**
 * The form's HTML. answers = { id: value }; uploads = [{ id, name, size, question_id }].
 * readonly: show answers as text (Tony's view). fileUrl(id) = where an upload can be opened.
 */
export function formHtml(questions, answers = {}, { readonly = false, uploads = [], fileUrl = null } = {}) {
  return questions.map((q) => {
    const v = answers[q.id];
    const id = `q-${esc(q.id)}`;
    const cls = `qf-q qf-q--${q.type}${q.half ? ' qf-q--half' : ''}`;
    if (q.type === 'heading') return `<h2 class="qf-heading">${esc(q.label)}</h2>`;
    if (q.type === 'text') return `<p class="qf-text">${esc(q.label).replace(/\n/g, '<br>')}</p>`;
    const label = `${esc(q.label)}${q.required ? ' <span class="qf-req" title="Needed">*</span>' : ''}`;
    if (readonly) {
      const files = q.type === 'file' ? uploads.filter((u) => u.question_id === q.id) : [];
      const shown = q.type === 'file'
        ? (files.length ? files.map((u) => (fileUrl ? `<a href="${esc(fileUrl(u.id))}" target="_blank" rel="noopener">${esc(u.name)}</a>` : esc(u.name)) + ` <small>${size(u.size)}</small>`).join('<br>') : '')
        : Array.isArray(v) ? v.map(esc).join(', ') : esc(v).replace(/\n/g, '<br>');
      return `<div class="${cls}"><p class="qf-label">${label}</p><p class="qf-answer">${shown || '<span class="qf-none">No answer</span>'}</p></div>`;
    }
    let field;
    const ph = q.placeholder ? ` placeholder="${esc(q.placeholder)}"` : '';
    if (q.type === 'short') field = `<input id="${id}" name="${esc(q.id)}" value="${esc(v)}"${ph} maxlength="500" />`;
    else if (q.type === 'long') field = `<textarea id="${id}" name="${esc(q.id)}" rows="4"${ph} maxlength="5000">${esc(v)}</textarea>`;
    else if (q.type === 'select') field = `<select id="${id}" name="${esc(q.id)}"><option value="">Choose…</option>${(q.options || []).map((o) => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    else if (q.type === 'radio' || q.type === 'checks') {
      const t = q.type === 'radio' ? 'radio' : 'checkbox';
      const on = (o) => (Array.isArray(v) ? v.includes(o) : v === o);
      field = `<div class="qf-options" role="${t === 'radio' ? 'radiogroup' : 'group'}" aria-labelledby="${id}-l">${(q.options || []).map((o) => `<label class="qf-option"><input type="${t}" name="${esc(q.id)}" value="${esc(o)}"${on(o) ? ' checked' : ''} /> ${esc(o)}</label>`).join('')}</div>`;
    } else if (q.type === 'file') {
      const files = uploads.filter((u) => u.question_id === q.id);
      field = `<ul class="qf-files">${files.map((u) => `<li data-upload="${u.id}">${fileUrl ? `<a href="${esc(fileUrl(u.id))}" target="_blank" rel="noopener">${esc(u.name)}</a>` : esc(u.name)} <small>${size(u.size)}</small> <button type="button" class="qf-remove" data-remove-upload="${u.id}" aria-label="Remove ${esc(u.name)}">Remove</button></li>`).join('')}</ul>
        <label class="qf-upload"><input type="file" data-upload-for="${esc(q.id)}" accept="image/*,application/pdf" multiple /> <span>Choose photos or files</span></label><small class="qf-hint">Up to 10 MB each</small>`;
    }
    const tag = q.type === 'radio' || q.type === 'checks' || q.type === 'file' ? 'p' : 'label';
    return `<div class="${cls}"><${tag} class="qf-label" id="${id}-l"${tag === 'label' ? ` for="${id}"` : ''}>${label}</${tag}>${field}</div>`;
  }).join('');
}

/** Read the answers back out of a form drawn by formHtml (browser only). */
export function readForm(form, questions) {
  const out = {};
  for (const q of questions) {
    if (!ASKS(q) || q.type === 'file') continue;
    const els = [...form.querySelectorAll(`[name="${CSS.escape(q.id)}"]`)];
    if (q.type === 'checks') out[q.id] = els.filter((e) => e.checked).map((e) => e.value);
    else if (q.type === 'radio') out[q.id] = els.find((e) => e.checked)?.value ?? '';
    else out[q.id] = els[0]?.value ?? '';
  }
  return out;
}

/** The styles for formHtml (shared by every page that shows a questionnaire). */
export const FORM_CSS = `
.qf { display: flex; flex-wrap: wrap; gap: 18px 16px; }
.qf-q { flex: 1 1 100%; display: flex; flex-direction: column; gap: 7px; min-width: 0; }
.qf-q--half { flex: 1 1 calc(50% - 8px); min-width: 220px; }
.qf-heading { flex: 1 1 100%; margin: 14px 0 0; font-weight: 300; font-size: 24px; color: var(--ink, #2f3021); }
.qf-text { flex: 1 1 100%; margin: 0; color: #555; line-height: 1.7; }
.qf-label { margin: 0; font-size: 15px; font-weight: 500; color: var(--ink, #2f3021); line-height: 1.5; }
.qf-req { color: #a8432a; }
.qf input:not([type=radio]):not([type=checkbox]):not([type=file]), .qf textarea, .qf select { font: inherit; font-size: 16px; padding: 11px 13px; border: 1px solid #ddd3c4; border-radius: 12px 0; background: #fff; color: inherit; width: 100%; box-sizing: border-box; }
.qf input:focus, .qf textarea:focus, .qf select:focus { outline: 2px solid var(--green, #5a5e3b); outline-offset: 1px; }
.qf-options { display: flex; flex-wrap: wrap; gap: 8px 22px; }
.qf-option { display: inline-flex; align-items: center; gap: 8px; font-size: 15px; cursor: pointer; }
.qf-option input { width: 18px; height: 18px; accent-color: var(--green, #5a5e3b); }
.qf-files { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 14px; }
.qf-files:empty { display: none; }
.qf-files small, .qf-hint { color: #888; font-size: 12px; }
.qf-remove { font: inherit; font-size: 12px; border: 0; background: none; color: #a8432a; cursor: pointer; text-decoration: underline; }
.qf-upload { display: inline-flex; align-items: center; gap: 10px; width: fit-content; padding: 10px 16px; border: 1px dashed var(--green, #5a5e3b); border-radius: 12px 0; color: var(--green, #5a5e3b); font-size: 14px; font-weight: 600; cursor: pointer; }
.qf-upload input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.qf-upload:focus-within { outline: 2px solid var(--green, #5a5e3b); outline-offset: 2px; }
.qf-answer { margin: 0; padding: 10px 13px; background: #faf7f2; border-radius: 10px 0; line-height: 1.6; color: #333; }
.qf-none { color: #999; font-style: italic; }
`;
