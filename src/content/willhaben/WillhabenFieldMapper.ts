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

/** Builds the values without touching the DOM — pure and unit-testable. */
export function mapProductToFields(product: Product, settings: Settings): MappedValue[] {
  const values: MappedValue[] = [];

  const title = product.listingTitle?.trim() || product.title;
  if (title) values.push({ field: 'title', label: 'Titel', value: title });

  const description = product.listingDescription?.trim() || product.description;
  if (description) values.push({ field: 'description', label: 'Beschreibung', value: description });

  const price = product.plannedSalePrice;
  if (price !== undefined && price !== null && price > 0) {
    // Austrian marketplaces expect a comma decimal separator.
    values.push({
      field: 'price',
      label: 'Preis',
      value: price.toFixed(2).replace('.', ','),
    });
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
    el.dispatchEvent(new win.Event('blur', { bubbles: true }));
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

  if (el.getAttribute('contenteditable') === 'true') {
    return setRichTextValue(el, value);
  }

  return false;
}

/**
 * Writes into a rich-text editor (the description field is one).
 *
 * Assigning `textContent` is not enough: editors like ProseMirror/Slate keep
 * their own document model and overwrite the DOM on the next render. Selecting
 * the existing content and inserting text through the editing command pipeline
 * produces real beforeinput/input events, which is what the editor listens to.
 */
function setRichTextValue(el: HTMLElement, value: string): boolean {
  const doc = el.ownerDocument;
  const win = doc.defaultView ?? window;

  el.focus();

  try {
    const range = doc.createRange();
    range.selectNodeContents(el);
    const selection = win.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    // execCommand is deprecated but remains the only widely supported way to
    // drive an editor's own input handling from the outside.
    const inserted = doc.execCommand?.('insertText', false, value);
    if (inserted && normalizeKey(el.textContent ?? '').length > 0) return true;
  } catch {
    // Not available (e.g. jsdom) — fall through to the direct assignment.
  }

  el.textContent = value;
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
  el.dispatchEvent(new win.Event('change', { bubbles: true }));
  return (el.textContent ?? '').includes(value.slice(0, 20));
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
}

/**
 * Fills the form and reports, field by field, what happened.
 *
 * A field ends up as:
 *   filled     – value written and verified by reading it back
 *   manual     – the extension cannot fill this reliably (images, category)
 *   not-found  – no control matched with sufficient confidence
 *   skipped    – no value available for this product
 */
export function fillWillhabenForm(
  product: Product,
  settings: Settings,
  options: FillOptions = {},
): FieldFillResult[] {
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
