import { CONDITION_LABELS, type Product } from '@/core/models/Product';
import type { Settings } from '@/core/models/Settings';
import type { FieldFillResult } from '@/shared/types';
import { normalizeKey } from '@/core/utils/text';
import { mapCategory } from '@/core/services/categoryMappings';
import {
  WILLHABEN_FIELDS,
  type FieldProfile,
  type WillhabenFieldId,
} from './willhabenSelectors';
import {
  collectCandidates,
  discoverFields,
  isEditableHost,
  type Candidate,
  type FieldMatch,
} from './fieldDiscovery';

/**
 * Turns a Product into concrete values for the marketplace form and writes them
 * into the discovered controls.
 *
 * Two rules govern everything in this file:
 *  1. Nothing is ever submitted. Only field values are set; the user reviews and
 *     publishes.
 *  2. A field that cannot be filled reliably is reported as `manual` with a
 *     reason, never silently skipped and never faked.
 */

export interface MappedValue {
  field: WillhabenFieldId;
  label: string;
  /** Value to type into the form. */
  value: string;
  /** Additional user-facing context, e.g. the proposed category path. */
  note?: string;
}

/**
 * Formats a price for the ad form.
 *
 * A whole amount is written without decimals: the marketplace's price input
 * filters the input itself, and feeding it "79,00" left "79" behind while the
 * field still counted as unfilled. Sending "79" avoids that entirely.
 */
export function formatPriceForForm(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace('.', ',');
}

/** The fields the Willhaben Marktplatz form actually offers. */
const CORE_FIELDS: WillhabenFieldId[] = ['price', 'title', 'description'];

/** Builds the values without touching the DOM — pure and unit-testable. */
export function mapProductToFields(product: Product, settings: Settings): MappedValue[] {
  const values: MappedValue[] = [];

  const price = product.plannedSalePrice;
  if (price !== undefined && price !== null && price > 0) {
    values.push({ field: 'price', label: 'Verkaufspreis', value: formatPriceForForm(price) });
  }

  const title = product.listingTitle?.trim() || product.title;
  if (title) values.push({ field: 'title', label: 'Titel', value: title });

  const description = product.listingDescription?.trim() || product.description;
  if (description) values.push({ field: 'description', label: 'Beschreibung', value: description });

  if (settings.onlyCoreFields) {
    // Images stay in the list because they are the one manual step the user
    // still needs the prepared values for.
    const images = product.selectedImages.length ? product.selectedImages : product.images;
    if (images.length) {
      values.push({
        field: 'images',
        label: 'Bilder',
        value: images.slice(0, settings.maxImages).join('\n'),
        note: `${Math.min(images.length, settings.maxImages)} Bild(er) vorbereitet.`,
      });
    }
    return values.filter((v) => CORE_FIELDS.includes(v.field) || v.field === 'images');
  }

  const category = mapCategory({
    categoryPath: product.category ? [product.category, product.subcategory ?? ''] : [],
    category: product.category,
    title: product.title,
    bulletPoints: product.bulletPoints,
  });
  values.push({
    field: 'category',
    label: 'Kategorie',
    value: category.path.join(' → '),
    note:
      category.mappingId === null
        ? 'Keine eindeutige Zuordnung gefunden – bitte Kategorie selbst wählen.'
        : `Vorschlag basierend auf der Amazon-Kategorie (${category.confidence}).`,
  });

  const condition = CONDITION_LABELS[product.condition];
  if (condition) values.push({ field: 'condition', label: 'Zustand', value: condition });

  if (product.brand) values.push({ field: 'brand', label: 'Marke', value: product.brand });
  if (product.color) values.push({ field: 'color', label: 'Farbe', value: product.color });
  if (product.size) values.push({ field: 'size', label: 'Größe', value: product.size });

  if (settings.defaultPostalCode) {
    values.push({ field: 'postalCode', label: 'PLZ', value: settings.defaultPostalCode });
  }
  if (settings.defaultLocation) {
    values.push({ field: 'location', label: 'Ort', value: settings.defaultLocation });
  }
  if (settings.defaultShipping) {
    values.push({ field: 'shipping', label: 'Versand', value: settings.defaultShipping });
  }
  if (settings.defaultPickup) {
    values.push({ field: 'pickup', label: 'Abholung', value: 'Ja' });
  }

  const images = product.selectedImages.length ? product.selectedImages : product.images;
  if (images.length) {
    values.push({
      field: 'images',
      label: 'Bilder',
      value: images.slice(0, settings.maxImages).join('\n'),
      note: `${Math.min(images.length, settings.maxImages)} Bild(er) vorbereitet.`,
    });
  }

  return values;
}

// --------------------------------------------------------------- DOM writing

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
      el.dispatchEvent(new win.InputEvent('beforeinput', init));
      el.textContent = value;
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
  hints?: Partial<Record<WillhabenFieldId, string>>;
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
 *   manual     – the extension cannot fill this reliably (images, category)
 *   not-found  – no control matched with sufficient confidence
 *   skipped    – no value available for this product
 */
export async function fillWillhabenForm(
  product: Product,
  settings: Settings,
  options: FillOptions = {},
): Promise<FieldFillResult[]> {
  const doc = options.doc ?? document;
  const values = mapProductToFields(product, settings);
  const candidates = collectCandidates(doc);

  // Only discover fields we actually have a value for.
  const wantedIds = new Set(values.map((v) => v.field));
  const profiles = WILLHABEN_FIELDS.filter((p) => wantedIds.has(p.id));
  const discovered = discoverFields(profiles, candidates);

  // A user-taught selector always beats the automatic match.
  for (const [field, selector] of Object.entries(options.hints ?? {})) {
    if (!selector) continue;
    const el = doc.querySelector<HTMLElement>(selector);
    if (!el) continue;
    const candidate = candidates.find((c) => c.element === el) ?? describeManually(el);
    if (candidate) {
      discovered.set(field as WillhabenFieldId, {
        candidate,
        score: 100,
        matchedBy: 'hint',
      });
    }
  }

  const results: FieldFillResult[] = [];

  for (const mapped of values) {
    const profile = WILLHABEN_FIELDS.find((p) => p.id === mapped.field) as FieldProfile;
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
    const success =
      match.candidate.kind === 'checkbox' || match.candidate.kind === 'radio'
        ? setToggle(el as HTMLInputElement, mapped.value)
        : setControlValue(el, mapped.value);

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
      label: '', ariaLabel: '', caption: '', placeholder: '', name: '', id: '', testId: '', nearby: '',
    },
    haystack: '',
    visible: true,
  };
}

export type { FieldMatch };
