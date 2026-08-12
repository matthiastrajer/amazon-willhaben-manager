import { normalizeKey, normalizeWhitespace, tokenize } from '@/core/utils/text';
import { OWN_UI_ATTRIBUTE } from './shadowHost';
import type { ControlKind, FieldProfile, ListingFieldId } from './fieldProfiles';

/**
 * Semantic form-field discovery.
 *
 * Rather than depending on generated CSS class names, every visible form
 * control on the page is collected together with the evidence that describes
 * it (label text, aria attributes, placeholder, name/id tokens, nearby text).
 * Each candidate is then scored against a field profile and the best match wins
 * — provided it clears a confidence floor.
 *
 * This is the only approach that survives the marketplace restyling its form,
 * and it is testable: `collectCandidates` works on any Document.
 */

export type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export interface Candidate {
  element: FormControl | HTMLElement;
  kind: ControlKind;
  /** All human-readable evidence, already normalised. */
  evidence: {
    label: string;
    ariaLabel: string;
    /** Visible caption rendered before the field rather than as a <label>. */
    caption: string;
    placeholder: string;
    name: string;
    id: string;
    testId: string;
    nearby: string;
  };
  /** Combined, normalised haystack used for keyword matching. */
  haystack: string;
  visible: boolean;
}

export interface FieldMatch {
  candidate: Candidate;
  score: number;
  /** Which evidence produced the strongest signal. */
  matchedBy: string;
}

const INPUT_TYPE_KINDS: Record<string, ControlKind> = {
  text: 'text',
  search: 'text',
  email: 'text',
  tel: 'text',
  url: 'text',
  number: 'number',
  checkbox: 'checkbox',
  radio: 'radio',
  file: 'file',
};

/**
 * Rich-text editors that are not plain `contenteditable="true"`.
 *
 * These are markers published by the editor libraries themselves (ProseMirror,
 * Quill, Lexical, Slate, TinyMCE) — stable library contracts, not marketplace
 * styling, so relying on them does not make the extension brittle.
 */
export const EDITABLE_SELECTOR = [
  '[contenteditable]:not([contenteditable="false"])',
  '[role="textbox"]',
  '.ProseMirror',
  '.ql-editor',
  '[data-lexical-editor]',
  '[data-slate-editor]',
  '.mce-content-body',
].join(', ');

/** True for any element that behaves like a rich-text input. */
export function isEditableHost(el: Element): boolean {
  const attr = el.getAttribute('contenteditable');
  if (attr !== null && attr !== 'false') return true;
  try {
    return el.matches(EDITABLE_SELECTOR);
  } catch {
    return false;
  }
}

function kindOf(el: Element): ControlKind | null {
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea') return 'textarea';
  if (tag === 'select') return 'select';
  if (tag === 'input') {
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    return INPUT_TYPE_KINDS[type] ?? null;
  }
  if (isEditableHost(el)) return 'textarea';
  return null;
}

/**
 * A control counts as visible when it participates in layout. jsdom has no
 * layout engine, so tests fall back to attribute-based checks.
 */
export function isVisible(el: Element): boolean {
  if (el.hasAttribute('hidden')) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  if ((el as HTMLInputElement).type === 'hidden') return false;
  if ((el as HTMLInputElement).disabled) return false;

  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (style) {
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (style.opacity === '0') return false;
  }

  const rects = typeof el.getClientRects === 'function' ? el.getClientRects() : null;
  // jsdom reports zero rects for everything; only trust this in a real browser.
  if (rects && rects.length === 0 && style && style.position !== 'fixed') {
    const hasLayoutEngine = (el as HTMLElement).offsetParent !== undefined
      && document.body?.getClientRects?.().length !== 0;
    if (hasLayoutEngine) return false;
  }
  return true;
}

/** The <label> text associated with a control, via for=, wrapping or aria. */
function labelTextFor(el: Element): string {
  const doc = el.ownerDocument;
  const parts: string[] = [];

  const id = el.getAttribute('id');
  if (id) {
    // CSS.escape keeps ids containing ":" or "." (common in generated markup) valid.
    const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id;
    try {
      for (const label of Array.from(doc.querySelectorAll(`label[for="${escaped}"]`))) {
        parts.push(label.textContent ?? '');
      }
    } catch {
      // Invalid selector for an exotic id — fall through to the other strategies.
    }
  }

  const wrapping = el.closest('label');
  if (wrapping) parts.push(wrapping.textContent ?? '');

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    for (const refId of labelledBy.split(/\s+/)) {
      const ref = doc.getElementById(refId);
      if (ref) parts.push(ref.textContent ?? '');
    }
  }

  return normalizeWhitespace(parts.join(' '));
}

/**
 * Text immediately surrounding a control. Willhaben-style forms often render
 * the caption as a sibling <div> rather than a real <label>, so the closest
 * ancestor that contains exactly one control is a good proxy for "this field's
 * caption".
 */
function nearbyText(el: Element): string {
  let node: Element | null = el.parentElement;
  let depth = 0;
  while (node && depth < 4) {
    const controls = node.querySelectorAll(CONTROL_QUERY);
    if (controls.length > 1) break;
    const text = normalizeWhitespace(node.textContent ?? '');
    if (text.length > 0 && text.length < 200) return text;
    node = node.parentElement;
    depth++;
  }
  return '';
}

const CONTROL_QUERY = [
  'input',
  'select',
  'textarea',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="textbox"]',
].join(', ');

/**
 * The visible caption of a field when the form does not use a real <label>.
 *
 * Such forms render the caption as an element *before* the field's container
 * ("Verkaufspreis", then the input box). Walking up the ancestors and taking the
 * nearest preceding sibling that carries short text and contains no control of
 * its own finds exactly that caption — and, unlike surrounding-text matching, it
 * does not get confused by adjacent controls such as a "zu verschenken" toggle.
 */
function captionText(el: Element): string {
  const direct = captionFrom(el);
  if (direct) return direct;

  // The field may live in a shadow tree while its caption sits in the host
  // document, so continue the search from the shadow host.
  const root = el.getRootNode?.();
  const host = root && 'host' in root ? ((root as ShadowRoot).host as Element | null) : null;
  return host ? captionFrom(host) : '';
}

function captionFrom(el: Element): string {
  let node: Element | null = el;
  for (let depth = 0; node && depth < 5; depth++) {
    let sibling = node.previousElementSibling;
    while (sibling) {
      if (!sibling.querySelector(CONTROL_QUERY) && !sibling.matches(CONTROL_QUERY)) {
        const text = normalizeWhitespace(sibling.textContent ?? '');
        // Captions are short; a paragraph of help text is not a caption. And a
        // caption has to contain an actual word: the "€" prefix before the price
        // input and the "B / I / • / 1." toolbar above the rich-text editor are
        // siblings too, and neither identifies anything — skip and look further.
        if (text && text.length <= 60 && tokenize(text, 3).length > 0) return text;
      }
      sibling = sibling.previousElementSibling;
    }
    node = node.parentElement;
  }
  return '';
}

/** Splits camelCase / snake_case / kebab-case attribute values into words. */
function tokenizeAttribute(value: string): string {
  return normalizeKey(value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_\-.]+/g, ' '));
}

/**
 * Collects the identifying evidence for any element — including ones that are
 * not controls themselves, such as the `<iframe>` that hosts an editor.
 */
export function buildEvidence(el: Element): Candidate['evidence'] {
  return {
    label: normalizeKey(labelTextFor(el)),
    ariaLabel: normalizeKey(el.getAttribute('aria-label') ?? ''),
    caption: normalizeKey(captionText(el)),
    // Rich-text editors have no `placeholder` attribute and use data-/aria- ones.
    placeholder: normalizeKey(
      el.getAttribute('placeholder') ??
        el.getAttribute('data-placeholder') ??
        el.getAttribute('aria-placeholder') ??
        '',
    ),
    name: tokenizeAttribute(el.getAttribute('name') ?? ''),
    id: tokenizeAttribute(el.getAttribute('id') ?? ''),
    testId: tokenizeAttribute(
      el.getAttribute('data-testid') ??
        el.getAttribute('data-test-id') ??
        el.getAttribute('data-cy') ??
        el.getAttribute('data-qa') ??
        '',
    ),
    nearby: normalizeKey(nearbyText(el)),
  };
}

export function describeCandidate(el: FormControl | HTMLElement): Candidate | null {
  const kind = kindOf(el);
  if (!kind) return null;

  const evidence = buildEvidence(el);
  return {
    element: el,
    kind,
    evidence,
    haystack: Object.values(evidence).filter(Boolean).join(' '),
    visible: isVisible(el),
  };
}

/**
 * Editors that render inside an iframe (TinyMCE and CKEditor classic do).
 *
 * The editable body lives in the frame, but its caption lives in the host page,
 * so the evidence is taken from the `<iframe>` element while the write target is
 * the inner body. Cross-origin frames are silently skipped — the extension has
 * no business reaching into those.
 */
function collectIframeEditors(doc: Document): Candidate[] {
  const out: Candidate[] = [];
  for (const frame of Array.from(doc.querySelectorAll('iframe'))) {
    let inner: Document | null = null;
    try {
      inner = frame.contentDocument;
    } catch {
      continue; // cross-origin
    }
    if (!inner?.body) continue;

    const editable =
      inner.body.getAttribute('contenteditable') !== null || inner.designMode === 'on'
        ? inner.body
        : inner.querySelector<HTMLElement>('[contenteditable]:not([contenteditable="false"])');
    if (!editable) continue;

    // Evidence comes from the frame's position in the host page, because that is
    // where the caption lives; the write target is the body inside the frame.
    const evidence = buildEvidence(frame);
    out.push({
      element: editable,
      kind: 'textarea',
      evidence,
      haystack: Object.values(evidence).filter(Boolean).join(' '),
      visible: isVisible(frame),
    });
  }
  return out;
}

type SearchRoot = Document | ShadowRoot | Element;

/**
 * Every root worth searching: the document plus every open shadow root nested
 * inside it. Web components hide their internals in a shadow tree, and a plain
 * `document.querySelectorAll` never sees through one.
 */
function* searchRoots(root: SearchRoot, depth = 0): Generator<SearchRoot> {
  yield root;
  if (depth > 6) return; // guard against pathological nesting
  for (const el of Array.from(root.querySelectorAll('*'))) {
    // Our own assist panel lives in a shadow root too; scanning it would offer
    // its inputs as candidates for the marketplace's fields.
    if (el.hasAttribute(OWN_UI_ATTRIBUTE)) continue;
    const shadow = (el as HTMLElement).shadowRoot;
    if (shadow) yield* searchRoots(shadow, depth + 1);
  }
}

/**
 * Every scoreable control, including ones inside open shadow roots and
 * same-origin iframes.
 *
 * When an editor nests an editable node inside an editable wrapper (a
 * `role="textbox"` around a `contenteditable`), only the innermost one is kept —
 * otherwise the two would compete for the same field and the wrapper might win.
 */
export function collectCandidates(doc: SearchRoot = document): Candidate[] {
  const candidates: Candidate[] = [];
  const seen = new Set<Element>();

  for (const root of searchRoots(doc)) {
    const nodes = Array.from(
      root.querySelectorAll<FormControl | HTMLElement>(
        `input, textarea, select, ${EDITABLE_SELECTOR}`,
      ),
    );
    for (const node of nodes) {
      if (seen.has(node)) continue;
      if (node.closest(`[${OWN_UI_ATTRIBUTE}]`)) continue;
      // Skip an editable host that contains another collected editable host.
      if (isEditableHost(node) && node.querySelector(EDITABLE_SELECTOR)) continue;
      seen.add(node);
      const candidate = describeCandidate(node);
      if (candidate) candidates.push(candidate);
    }

    // `iframe` is not a form control, so this only applies to full documents.
    if ('body' in root) candidates.push(...collectIframeEditors(root as Document));
  }

  return candidates;
}

/**
 * Evidence weights. Explicit labels and aria-labels are authored for humans and
 * are therefore the most trustworthy; attribute names come next; surrounding
 * text is the weakest because it can bleed in from neighbouring content.
 */
const EVIDENCE_WEIGHTS: Record<keyof Candidate['evidence'], number> = {
  label: 10,
  ariaLabel: 9,
  // A visible caption directly before the field is nearly as reliable as a
  // real <label>, and it is how Willhaben's ad form is actually built.
  caption: 8,
  testId: 7,
  name: 6,
  id: 5,
  placeholder: 5,
  nearby: 3,
};

/** Score below which a match is discarded and the field is reported as manual. */
export const MIN_SCORE = 6;

/**
 * Positive match. Substring matching is deliberate: German compounds mean the
 * caption "Verkaufspreis" has to satisfy the keyword "preis".
 */
function keywordHit(haystack: string, keyword: string): boolean {
  if (!haystack || !keyword) return false;
  return haystack.includes(keyword);
}

/**
 * Negative match — strictly whole-token, and never applied to loose surrounding
 * text. Substring matching here is actively harmful: the help sentence "hilft
 * Suchenden deine Anzeige zu finden" sits next to the real title field and would
 * otherwise disqualify it via the exclusion keyword "suchen".
 */
function exclusionHit(haystack: string, keyword: string): boolean {
  if (!haystack || !keyword) return false;
  return ` ${haystack} `.includes(` ${keyword} `);
}

/** Evidence authored to identify the field; excludes noisy ambient text. */
const AUTHORED_EVIDENCE: (keyof Candidate['evidence'])[] = [
  'label',
  'ariaLabel',
  'caption',
  'placeholder',
  'name',
  'id',
  'testId',
];

export function scoreCandidate(candidate: Candidate, profile: FieldProfile): FieldMatch | null {
  if (!profile.kinds.includes(candidate.kind)) return null;
  if (!candidate.visible) return null;

  for (const bad of profile.keywords.never ?? []) {
    const keyword = normalizeKey(bad);
    for (const source of AUTHORED_EVIDENCE) {
      if (exclusionHit(candidate.evidence[source], keyword)) return null;
    }
  }

  let score = 0;
  let best = { weight: 0, key: '' };

  for (const [key, weight] of Object.entries(EVIDENCE_WEIGHTS) as [
    keyof Candidate['evidence'],
    number,
  ][]) {
    const text = candidate.evidence[key];
    if (!text) continue;

    for (const kw of profile.keywords.must) {
      if (keywordHit(text, normalizeKey(kw))) {
        score += weight;
        if (weight > best.weight) best = { weight, key };
        break; // one `must` hit per evidence source
      }
    }
    for (const kw of profile.keywords.nice ?? []) {
      if (keywordHit(text, normalizeKey(kw))) {
        score += Math.ceil(weight / 3);
        break;
      }
    }
  }

  if (score === 0) return null;

  // Prefer the control kind that fits the field best (a textarea for the
  // description, a number input for the price).
  const preferredKind = profile.kinds[0];
  if (candidate.kind === preferredKind) score += 2;

  // A maxlength far below what we need signals the wrong field.
  const maxLength = Number((candidate.element as HTMLInputElement).maxLength ?? -1);
  if (profile.maxLength && maxLength > 0 && maxLength < 3) score -= 5;

  return { candidate, score, matchedBy: best.key || 'keyword' };
}

/**
 * Best control for each requested field. A control is never assigned to two
 * fields: the highest-scoring assignment wins and the loser falls through to
 * its next-best candidate.
 */
export function discoverFields(
  profiles: FieldProfile[],
  candidates: Candidate[],
): Map<ListingFieldId, FieldMatch> {
  const ranked: { field: ListingFieldId; match: FieldMatch }[] = [];

  for (const profile of profiles) {
    for (const candidate of candidates) {
      const match = scoreCandidate(candidate, profile);
      if (match && match.score >= MIN_SCORE) ranked.push({ field: profile.id, match });
    }
  }

  ranked.sort((a, b) => b.match.score - a.match.score);

  const result = new Map<ListingFieldId, FieldMatch>();
  const usedElements = new Set<Element>();

  for (const { field, match } of ranked) {
    if (result.has(field)) continue;
    if (usedElements.has(match.candidate.element)) continue;
    result.set(field, match);
    usedElements.add(match.candidate.element);
  }

  applyUniqueEditorFallback(profiles, candidates, result, usedElements);

  return result;
}

/**
 * Last resort for the description field.
 *
 * A rich-text editor can carry no usable evidence at all — no label, no aria
 * attribute, a caption that is not a sibling, a generated wrapper. But an ad form
 * has exactly one multi-line editor, so when the description is unmatched and
 * precisely one unassigned editor remains, it can only be that one. This is a
 * deduction from the page's structure rather than a guess about its markup.
 *
 * It stays deliberately strict: with zero or several free editors nothing is
 * assigned, and the field is honestly reported as not found.
 */
function applyUniqueEditorFallback(
  profiles: FieldProfile[],
  candidates: Candidate[],
  result: Map<ListingFieldId, FieldMatch>,
  usedElements: Set<Element>,
): void {
  const wantsDescription = profiles.some((p) => p.id === 'description');
  if (!wantsDescription || result.has('description')) return;

  const profile = profiles.find((p) => p.id === 'description')!;
  const free = candidates.filter((c) => {
    if (c.kind !== 'textarea' || !c.visible) return false;
    if (usedElements.has(c.element)) return false;
    // Never grab something that is explicitly something else.
    for (const bad of profile.keywords.never ?? []) {
      for (const source of AUTHORED_EVIDENCE) {
        if (exclusionHit(c.evidence[source], normalizeKey(bad))) return false;
      }
    }
    // A search box is a single-line control, but guard anyway.
    return !/such|search|filter/.test(c.haystack);
  });

  if (free.length !== 1) return;

  result.set('description', {
    candidate: free[0]!,
    score: MIN_SCORE,
    matchedBy: 'einziger-editor',
  });
  usedElements.add(free[0]!.element);
}
