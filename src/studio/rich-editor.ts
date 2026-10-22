import { askText } from './dialogs';
// The studio CRM's rich text editor (TipTap): bold, italic, underline, text size, colours,
// headings, lists, links, buttons and fill-ins like {{first_name}}. Used for email templates,
// "Review and send", and quote packages, introduction and notes.
//
// attachRich(textarea) puts the editor in place of a <textarea> and keeps the textarea's value
// up to date as HTML (firing its 'input' event), so forms read it as before. Older text written
// in simple Markdown is converted when it's opened (see functions-lib/rich-html.js).
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import { toHtml, clean } from '../../functions-lib/rich-html.js';

// Text size, kept as an inline style on the text-style mark.
const FontSize = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (el: HTMLElement) => el.style.fontSize || null,
        renderHTML: (a: { fontSize?: string | null }) => (a.fontSize ? { style: `font-size:${a.fontSize}` } : {}),
      },
    };
  },
});
// Links can be shown as buttons (class="button").
const RichLink = Link.extend({
  addAttributes() {
    return { ...this.parent?.(), class: { default: null, parseHTML: (el: HTMLElement) => (el.classList.contains('button') ? 'button' : null) } };
  },
}).configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: null, target: null } });

const COLOURS: [string, string][] = [['#1a1a1a', 'Ink'], ['#5a5e3b', 'Green'], ['#3e4229', 'Olive'], ['#b39a6b', 'Gold'], ['#a3b07a', 'Sage'], ['#8c1d18', 'Red']];
const SIZES: [string, string][] = [['13px', 'Small'], ['', 'Normal'], ['20px', 'Large'], ['26px', 'Extra large']];

export const FIELDS = ['first_name', 'last_name', 'partner_name', 'couple', 'event_date', 'venue', 'quote_link', 'quote_valid_until', 'payment_plan', 'portal_link', 'gallery_link', 'contract_link', 'payment_amount', 'payment_due_date', 'invoice_number', 'invoice_label', 'invoice_link', 'questionnaire_link', 'shoot_date', 'shoot_time', 'location', 'booking_link', 'contact_name', 'business', 'our_page'];

export type Rich = { editor: Editor; set: (text: string) => void; get: () => string };

export function attachRich(textarea: HTMLTextAreaElement, opts: { fields?: string[]; minHeight?: number } = {}): Rich {
  const wrap = document.createElement('div');
  wrap.className = 'rich';
  const fields = opts.fields ?? FIELDS;
  wrap.innerHTML = `<div class="rich-bar" role="toolbar">
    <button type="button" data-c="bold" title="Bold"><b>B</b></button>
    <button type="button" data-c="italic" title="Italic"><i>I</i></button>
    <button type="button" data-c="underline" title="Underline"><u>U</u></button>
    <select data-c="size" title="Text size">${SIZES.map(([v, l]) => `<option value="${v}"${v ? '' : ' selected'}>${l}</option>`).join('')}</select>
    <select data-c="block" title="Style"><option value="p">Paragraph</option><option value="h2">Heading</option><option value="h3">SECTION LABEL</option></select>
    <span class="rich-colours">${COLOURS.map(([c, n]) => `<button type="button" data-colour="${c}" title="${n}" style="background:${c}"></button>`).join('')}<label title="Any colour" class="rich-pick">🎨<input type="color" data-c="pick" /></label><button type="button" data-c="nocolour" title="Remove colour">⨯</button></span>
    <button type="button" data-c="bullet" title="Bulleted list">• List</button>
    <button type="button" data-c="ordered" title="Numbered list">1. List</button>
    <button type="button" data-c="link" title="Link">🔗 Link</button>
    <button type="button" data-c="button" title="Button">▭ Button</button>
    ${fields.length ? `<select data-c="field" title="Insert a fill-in"><option value="">+ Fill-in</option>${fields.map((f) => `<option value="${f}">${f.replace(/_/g, ' ')}</option>`).join('')}</select>` : ''}
  </div><div class="rich-area"></div>`;
  textarea.before(wrap);
  textarea.hidden = true;
  const area = wrap.querySelector<HTMLElement>('.rich-area')!;
  if (opts.minHeight) area.style.minHeight = `${opts.minHeight}px`;

  const sync = (tell = true) => {
    textarea.value = clean(editor.getHTML());
    if (tell) textarea.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const editor = new Editor({
    element: area,
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] }, codeBlock: false, code: false, horizontalRule: false }), Underline, FontSize, Color, RichLink],
    content: toHtml(textarea.value),
    onUpdate: () => sync(),
    onSelectionUpdate: () => refresh(),
  });
  const bar = wrap.querySelector<HTMLElement>('.rich-bar')!;
  const refresh = () => {
    bar.querySelectorAll<HTMLButtonElement>('[data-c]').forEach((b) => {
      const c = b.dataset.c!;
      const on = c === 'bullet' ? editor.isActive('bulletList') : c === 'ordered' ? editor.isActive('orderedList') : c === 'link' ? editor.isActive('link') : ['bold', 'italic', 'underline'].includes(c) && editor.isActive(c);
      b.classList.toggle('on', !!on);
    });
    (bar.querySelector('[data-c="block"]') as HTMLSelectElement).value = editor.isActive('heading', { level: 2 }) ? 'h2' : editor.isActive('heading', { level: 3 }) ? 'h3' : 'p';
    (bar.querySelector('[data-c="size"]') as HTMLSelectElement).value = editor.getAttributes('textStyle').fontSize ?? '';
  };

  // The editor often sits inside a <label> ("Body", "What's included"): a click in the text would
  // otherwise also "click" the label's first button, Bold, and toggle bold on every click.
  wrap.addEventListener('click', (e) => { if (wrap.closest('label') && !(e.target as HTMLElement).closest('button, select, input, .rich-pick')) e.preventDefault(); });
  bar.addEventListener('mousedown', (e) => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); }); // keep the selection
  bar.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b) return;
    const ch = editor.chain().focus();
    const colour = b.dataset.colour;
    if (colour) { ch.setColor(colour).run(); return; }
    switch (b.dataset.c) {
      case 'bold': ch.toggleBold().run(); break;
      case 'italic': ch.toggleItalic().run(); break;
      case 'underline': ch.toggleUnderline().run(); break;
      case 'nocolour': ch.unsetColor().run(); break;
      case 'bullet': ch.toggleBulletList().run(); break;
      case 'ordered': ch.toggleOrderedList().run(); break;
      case 'link': {
        const current = editor.getAttributes('link').href ?? '';
        const href = await askText('Link address (leave empty to remove the link):', current || 'https://');
        if (href === null) return;
        if (!href || href === 'https://') ch.extendMarkRange('link').unsetLink().run();
        else ch.extendMarkRange('link').setLink({ href }).run();
        break;
      }
      case 'button': {
        const label = await askText('Button text:', 'View your quote');
        if (!label) return;
        const href = await askText('Button link (a web address, or a fill-in like {{quote_link}}):', '{{quote_link}}');
        if (!href) return;
        ch.insertContent(`<p><a href="${href.replace(/"/g, '')}" class="button">${label.replace(/[<>]/g, '')}</a></p>`).run();
        break;
      }
    }
    refresh();
  });
  bar.addEventListener('change', (e) => {
    const t = e.target as HTMLSelectElement | HTMLInputElement;
    const ch = editor.chain().focus();
    if (t.dataset.c === 'size') (t.value ? ch.setMark('textStyle', { fontSize: t.value }) : ch.setMark('textStyle', { fontSize: null }).removeEmptyTextStyle()).run();
    if (t.dataset.c === 'block') (t.value === 'p' ? ch.setParagraph() : ch.toggleHeading({ level: t.value === 'h2' ? 2 : 3 })).run();
    if (t.dataset.c === 'pick') ch.setColor(t.value).run();
    if (t.dataset.c === 'field' && t.value) { ch.insertContent(`{{${t.value}}}`).run(); t.value = ''; }
    refresh();
  });
  sync(false);
  return {
    editor,
    set: (text: string) => { editor.commands.setContent(toHtml(text), false); textarea.value = clean(editor.getHTML()); refresh(); },
    get: () => clean(editor.getHTML()),
  };
}
