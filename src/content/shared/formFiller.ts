import type { FieldFillResult } from '@/shared/types';
import { normalizeKey } from '@/core/utils/text';
import {
  collectCandidates,
  discoverFields,
  isEditableHost,
  type Candidate,
} from './fieldDiscovery';
import type { ListingFieldId, PlatformFormConfig } from './fieldProfiles';

/**
 * Writes prepared values into whatever marketplace form is on screen.
 *
 * Two rules govern everything in this file:
 *  1. Nothing is ever submitted. Only field values are set; the user reviews and
 *     publishes.
 *  2. A field that cannot be filled reliably is reported as `manual` or
 *     `not-found` with a reason, never silently skipped and never faked.
 */

/** One value ready to be written into a form field. */
export interface MappedValue {
  field: ListingFieldId;
  label: string;
  value: string;
  /** Additional user-facing context, e.g. the proposed category path. */
  note?: string;
}

// ------------------------------------------------------------- DOM writing

/**
 * Writes a value into a control the way a user would.
 *
 * Framework-managed inputs keep their value in component state, so assigning
 * `el.value` directly is discarded on the next render. Going through the native
 * value setter and then dispatching bubbling `input`/`change` events is what
 * makes the framework observe the change.
 */
export function setControlValue(el: HTMLElement, value: string): boolean {
  const win = el.ownerDocument.defaultView ?? window;

  if (el instanceof win.HTMLInputElement || el instanceof win.HTMLTextAreaElement) {
    const proto =
      el instanceof win.HTMLTextAreaElement
        ? win.HTMLTextAreaElement.prototype
        : win.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

    el.focus();
    if (setter) setter.call(el, value);
    else el.value = value;

    el.dispatchEvent(new win.Event('input', { bubbles: true }));
    el.dispatchEvent(new win.Event('change', { bubbles: true }));
    // Deliberately NO blur here. Blurring synchronously made the form run its
    // "required" validation before it had processed the new value, so the price
    // field showed "Dieses Feld muss ausgefüllt werden" even though the value
    // was there. The user's first interaction blurs the field naturally.
    return el.value === value;
  }

  if (el instanceof win.HTMLSelectElement) {
    const target = normalizeKey(value);
    const option = Array.from(el.options).find((o) => {
      const text = normalizeKey(o.textContent ?? '');
      const val = normalizeKey(o.value);
      return text === target || val === target || text.includes(target) || target.includes(text);
    });
    if (!option) return false;
    el.value = option.value;
    el.dispatchEvent(new win.Event('input', { bubbles: true }));
    el.dispatchEvent(new win.Event('change', { bubbles: true }));
    return true;
  }

  if (isEditableHost(el)) {
    return setRichTextValue(el, value);
  }

  return false;
}

/**
 * The element that actually holds the text. A `role="textbox"` wrapper often
 * sits around the real contenteditable node, and writing to the wrapper would
 * either do nothing or destroy the editor's own DOM.
 */
function resolveEditable(el: HTMLElement): HTMLElement {
  const attr = el.getAttribute('contenteditable');
  if (attr !== null && attr !== 'false') return el;
  const inner = el.querySelector<HTMLElement>('[contenteditable]:not([contenteditable="false"])');
  return inner ?? el;
}

/** Did the value land? Compared loosely, because editors re-wrap the markup. */
function editorHasValue(el: HTMLElement, value: string): boolean {
  const got = normalizeKey(el.textContent ?? '');
  const want = normalizeKey(value.slice(0, 40));
  return want.length > 0 && got.includes(want);
}

function selectAll(el: HTMLElement): void {
  const doc = el.ownerDocument;
  const win = doc.defaultView ?? window;
  const range = doc.createRange();
  range.selectNodeContents(el);
  const selection = win.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/**
 * Writes into a rich-text editor (the description field is one).
 *
 * Assigning `textContent` is not enough on its own: editors such as ProseMirror,
 * Lexical or Quill keep their own document model and overwrite the DOM on the
 * next render. So several routes are tried in descending order of authenticity,
 * each verified by reading the text back:
 *
 *   1. `insertText` command — drives the editor's own input handling
 *   2. a synthetic paste with a DataTransfer — the route editors support best
 *   3. a `beforeinput`/`input` InputEvent pair carrying the text
 *   4. direct `textContent` assignment as a last resort
 */
function setRichTextValue(host: HTMLElement, value: string): boolean {
  const el = resolveEditable(host);
  const doc = el.ownerDocument;
  const win = doc.defaultView ?? window;

  el.focus();

  // 1. editing command
  try {
    selectAll(el);
    if (doc.execCommand?.('insertText', false, value) && editorHasValue(el, value)) return true;
  } catch {
    // not supported here
  }

  // 2. synthetic paste
  try {
    if (typeof win.DataTransfer === 'function' && typeof win.ClipboardEvent === 'function') {
      selectAll(el);
      const data = new win.DataTransfer();
      data.setData('text/plain', value);
      el.dispatchEvent(
        new win.ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
      );
      if (editorHasValue(el, value)) return true;
    }
  } catch {
    // not supported here
  }

  // 3. InputEvent pair
  try {
    if (typeof win.InputEvent === 'function') {
      selectAll(el);
      const init = { bubbles: true, cancelable: true, inputType: 'insertText', data: value };
      const before = new win.InputEvent('beforeinput', init);
      const handled = !el.dispatchEvent(before);
      // A cancelled beforeinput means the editor inserted the text through its
      // own model. Writing textContent on top of that would fight the editor.
      if (!handled) el.textContent = value;
      el.dispatchEvent(new win.InputEvent('input', init));
      if (editorHasValue(el, value)) return true;
    }
  } catch {
    // not supported here
  }

  // 4. plain assignment
  el.textContent = value;
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
  el.dispatchEvent(new win.Event('change', { bubbles: true }));
  return editorHasValue(el, value);
}

/**
 * Writes into a rich-text editor and makes sure the value survives.
 *
 * An editor that is still mounting accepts the text and then replaces the DOM
 * from its own (empty) document model on the next render — the write reads back
 * as successful and the field ends up empty anyway. So the value is verified
 * again after a pause and rewritten if it was lost.
 */
async function writeEditorWithRetry(
  el: HTMLElement,
  value: string,
  settleMs: number,
  attempts = 3,
): Promise<boolean> {
  const target = resolveEditable(el);

  for (let attempt = 0; attempt < attempts; attempt++) {
    const written = setRichTextValue(el, value);
    // Give the editor a chance to re-render before trusting the result.
    await new Promise((resolve) => setTimeout(resolve, Math.max(settleMs, 120)));
    if (editorHasValue(target, value)) return true;
    if (!written && attempt === attempts - 1) return false;
  }

  return editorHasValue(target, value);
}

/** Checkbox/radio handling: a truthy value ticks the box. */
function setToggle(el: HTMLInputElement, value: string): boolean {
  const win = el.ownerDocument.defaultView ?? window;
  const shouldCheck = !/^(nein|no|false|0|nur abholung)$/i.test(value.trim());
  if (el.checked !== shouldCheck) {
    el.click(); // click() keeps framework state in sync better than setting .checked
    if (el.checked !== shouldCheck) {
      el.checked = shouldCheck;
      el.dispatchEvent(new win.Event('change', { bubbles: true }));
    }
  }
  return el.checked === shouldCheck;
}


export interface FillOptions {
  /** User-taught element hints: field id -> CSS selector. */
  hints?: Partial<Record<ListingFieldId, string>>;
  doc?: Document;
  /** Pause between fields so the page's framework can flush its state. */
  settleMs?: number;
}

const DEFAULT_SETTLE_MS = 40;

const settle = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

/**
 * Fills the form and reports, field by field, what happened.
 *
 * A field ends up as:
 *   filled     – value written and verified by reading it back
 *   manual     – the platform cannot accept this automatically (images, category)
 *   not-found  – no control matched with sufficient confidence
 */
export async function fillListingForm(
  config: PlatformFormConfig,
  values: MappedValue[],
  options: FillOptions = {},
): Promise<FieldFillResult[]> {
  const doc = options.doc ?? document;
  const candidates = collectCandidates(doc);

  // Only discover fields we actually have a value for.
  const wanted = new Set(values.map((v) => v.field));
  const profiles = config.fields.filter((p) => wanted.has(p.id));
  const discovered = discoverFields(profiles, candidates);

  // A user-taught selector always beats the automatic match.
  for (const [field, selector] of Object.entries(options.hints ?? {})) {
    if (!selector) continue;
    const el = doc.querySelector<HTMLElement>(selector);
    if (!el) continue;
    const candidate = candidates.find((c) => c.element === el) ?? describeManually(el);
    if (candidate) {
      discovered.set(field as ListingFieldId, { candidate, score: 100, matchedBy: 'hint' });
    }
  }

  const results: FieldFillResult[] = [];

  for (const mapped of values) {
    const profile = config.fields.find((p) => p.id === mapped.field);
    if (!profile) continue;
    const match = discovered.get(mapped.field);

    if (!profile.autoFillable) {
      results.push({
        field: mapped.field,
        label: mapped.label,
        status: 'manual',
        value: mapped.value,
        reason: mapped.note ? `${profile.manualHint} ${mapped.note}` : profile.manualHint,
        matchedBy: match?.matchedBy,
      });
      continue;
    }

    if (!match) {
      results.push({
        field: mapped.field,
        label: mapped.label,
        status: 'not-found',
        value: mapped.value,
        reason: 'Kein passendes Formularfeld erkannt – bitte manuell eintragen.',
      });
      continue;
    }

    const el = match.candidate.element;
    let success: boolean;
    if (match.candidate.kind === 'checkbox' || match.candidate.kind === 'radio') {
      success = setToggle(el as HTMLInputElement, mapped.value);
    } else if (isEditableHost(el)) {
      success = await writeEditorWithRetry(el, mapped.value, options.settleMs ?? DEFAULT_SETTLE_MS);
    } else {
      success = setControlValue(el, mapped.value);
    }

    // Yield before touching the next field. Focusing the next control blurs this
    // one synchronously, and a framework that has not flushed its state yet then
    // validates against the old value — which is what made the price field show
    // "Dieses Feld muss ausgefüllt werden" right after it had been filled.
    await settle(options.settleMs ?? DEFAULT_SETTLE_MS);

    results.push({
      field: mapped.field,
      label: mapped.label,
      status: success ? 'filled' : 'not-found',
      value: mapped.value,
      matchedBy: match.matchedBy,
      reason: success
        ? mapped.note
        : 'Der Wert konnte nicht übernommen werden – bitte manuell eintragen.',
    });
  }

  // Release the focus once everything is in place, so the form validates against
  // the final values instead of against a half-filled state.
  await settle(options.settleMs ?? DEFAULT_SETTLE_MS);
  const active = doc.activeElement as HTMLElement | null;
  if (active && typeof active.blur === 'function') active.blur();

  return results;
}

/** Minimal candidate for an element the user pointed at themselves. */
function describeManually(el: HTMLElement): Candidate | null {
  const tag = el.tagName.toLowerCase();
  const kind =
    tag === 'textarea'
      ? 'textarea'
      : tag === 'select'
        ? 'select'
        : ((el.getAttribute('type') ?? 'text') as Candidate['kind']);
  return {
    element: el,
    kind: kind as Candidate['kind'],
    evidence: {
      label: '', ariaLabel: '', caption: '', placeholder: '',
      name: '', id: '', testId: '', nearby: '',
    },
    haystack: '',
    visible: true,
  };
}
