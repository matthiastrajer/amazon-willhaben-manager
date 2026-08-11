import type { FieldFillResult } from '@/shared/types';
import type { Product } from '@/core/models/Product';
import { CONTENT_TOKENS, createShadowUi, type ShadowUi } from '../shared/shadowHost';

const HOST_ID = 'awm-willhaben-assist';

const PANEL_CSS = `
${CONTENT_TOKENS}
.awm-root {
  position: fixed;
  top: 16px;
  right: 16px;
  width: 340px;
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
  background: var(--awm-bg);
  border: 1px solid var(--awm-border);
  border-radius: var(--awm-radius);
  box-shadow: var(--awm-shadow);
  z-index: 2147483000;
  overflow: hidden;
}
header {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 14px;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  color: #fff;
}
header .title { font-weight: 700; font-size: 13px; flex: 1; }
header button {
  background: rgba(255,255,255,.18); border: none; color: #fff;
  width: 24px; height: 24px; border-radius: 6px; cursor: pointer; font: inherit; line-height: 1;
}
header button:hover { background: rgba(255,255,255,.3); }
.body { overflow-y: auto; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
.product { font-size: 12px; color: var(--awm-muted); }
.product strong { color: var(--awm-text); display: block; font-size: 13px; margin-bottom: 2px; }
.summary { display: flex; gap: 6px; flex-wrap: wrap; font-size: 11px; }
.chip { padding: 3px 8px; border-radius: 999px; font-weight: 600; }
.chip.ok { background: rgba(5,150,105,.12); color: var(--awm-ok); }
.chip.warn { background: rgba(217,119,6,.14); color: var(--awm-warn); }
.chip.err { background: rgba(220,38,38,.12); color: var(--awm-err); }
ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
li {
  border: 1px solid var(--awm-border); border-radius: 8px; padding: 8px 10px;
  background: var(--awm-surface); font-size: 12px;
}
li .row { display: flex; align-items: center; gap: 6px; }
li .name { font-weight: 600; flex: 1; }
li .state { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; font-weight: 700; }
li.filled { border-left: 3px solid var(--awm-ok); }
li.filled .state { color: var(--awm-ok); }
li.manual { border-left: 3px solid var(--awm-warn); }
li.manual .state { color: var(--awm-warn); }
li.notfound { border-left: 3px solid var(--awm-err); }
li.notfound .state { color: var(--awm-err); }
li .reason { color: var(--awm-muted); margin-top: 4px; line-height: 1.35; }
li .value {
  margin-top: 6px; padding: 6px; background: var(--awm-bg); border: 1px solid var(--awm-border);
  border-radius: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px; white-space: pre-wrap; word-break: break-word; max-height: 90px; overflow-y: auto;
}
.actions { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
button.act {
  border: 1px solid var(--awm-border); background: var(--awm-bg); color: var(--awm-text);
  border-radius: 6px; padding: 4px 8px; font: inherit; font-size: 11px; font-weight: 600; cursor: pointer;
}
button.act:hover { border-color: var(--awm-brand); color: var(--awm-brand); }
button.act.primary { background: var(--awm-brand); border-color: var(--awm-brand); color: #fff; }
button.act.primary:hover { background: var(--awm-brand-strong); }
footer {
  border-top: 1px solid var(--awm-border); padding: 10px 14px;
  display: flex; flex-direction: column; gap: 8px; background: var(--awm-surface);
}
footer .note { font-size: 11px; color: var(--awm-muted); line-height: 1.4; }
footer .buttons { display: flex; gap: 6px; }
footer .buttons button { flex: 1; }
input.url {
  width: 100%; padding: 6px 8px; border: 1px solid var(--awm-border); border-radius: 6px;
  font: inherit; font-size: 12px; background: var(--awm-bg); color: var(--awm-text);
}
.collapsed .body, .collapsed footer { display: none; }
.teaching { outline: 3px dashed var(--awm-brand) !important; outline-offset: 2px; }
`;

export interface AssistPanelHandlers {
  onRetry(): void;
  onConfirmListed(url: string): Promise<void>;
  onTeachField(field: string): Promise<void>;
  onOpenDashboard(): void;
}

export interface AssistPanelState {
  product: Product;
  results: FieldFillResult[];
  formDetected: boolean;
  error?: string;
}

const STATE_LABELS: Record<FieldFillResult['status'], string> = {
  filled: 'übernommen',
  manual: 'manuell',
  'not-found': 'nicht gefunden',
  skipped: 'übersprungen',
};

export class AssistPanel {
  private ui: ShadowUi | null = null;

  constructor(private readonly handlers: AssistPanelHandlers) {}

  render(state: AssistPanelState): void {
    this.ui ??= createShadowUi(HOST_ID, PANEL_CSS);
    const root = this.ui.container;
    root.innerHTML = '';

    root.append(this.header(), this.bodyEl(state), this.footer(state));
  }

  destroy(): void {
    this.ui?.destroy();
    this.ui = null;
  }

  private header(): HTMLElement {
    const header = document.createElement('header');
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = 'Amazon → Willhaben';

    const collapse = document.createElement('button');
    collapse.type = 'button';
    collapse.title = 'Ein-/ausklappen';
    collapse.textContent = '–';
    collapse.addEventListener('click', () => {
      this.ui?.container.classList.toggle('collapsed');
      collapse.textContent = this.ui?.container.classList.contains('collapsed') ? '+' : '–';
    });

    const close = document.createElement('button');
    close.type = 'button';
    close.title = 'Schließen';
    close.textContent = '×';
    close.addEventListener('click', () => this.destroy());

    header.append(title, collapse, close);
    return header;
  }

  private bodyEl(state: AssistPanelState): HTMLElement {
    const body = document.createElement('div');
    body.className = 'body';

    const product = document.createElement('div');
    product.className = 'product';
    product.innerHTML = '<strong></strong>';
    product.querySelector('strong')!.textContent =
      state.product.listingTitle || state.product.title;
    const price = state.product.plannedSalePrice;
    product.append(
      document.createTextNode(
        price ? `Geplanter Verkaufspreis: ${price.toFixed(2).replace('.', ',')} €` : 'Kein Verkaufspreis gesetzt',
      ),
    );
    body.appendChild(product);

    if (!state.formDetected) {
      const warn = document.createElement('div');
      warn.className = 'summary';
      warn.innerHTML = '<span class="chip err">Formular nicht erkannt</span>';
      body.appendChild(warn);

      const hint = document.createElement('div');
      hint.className = 'product';
      hint.textContent =
        state.error ??
        'Das Willhaben-Formular konnte nicht automatisch erkannt werden. Öffne die Anzeigenerstellung und versuche es erneut – die Werte stehen unten zum Kopieren bereit.';
      body.appendChild(hint);
    } else {
      const counts = {
        filled: state.results.filter((r) => r.status === 'filled').length,
        manual: state.results.filter((r) => r.status === 'manual').length,
        missing: state.results.filter((r) => r.status === 'not-found').length,
      };
      const summary = document.createElement('div');
      summary.className = 'summary';
      summary.innerHTML =
        `<span class="chip ok">${counts.filled} übernommen</span>` +
        (counts.manual ? `<span class="chip warn">${counts.manual} manuell</span>` : '') +
        (counts.missing ? `<span class="chip err">${counts.missing} offen</span>` : '');
      body.appendChild(summary);
    }

    const list = document.createElement('ul');
    for (const result of state.results) {
      list.appendChild(this.fieldItem(result));
    }
    body.appendChild(list);

    return body;
  }

  private fieldItem(result: FieldFillResult): HTMLElement {
    const li = document.createElement('li');
    li.className = result.status === 'not-found' ? 'notfound' : result.status;

    const row = document.createElement('div');
    row.className = 'row';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = result.label;
    const state = document.createElement('span');
    state.className = 'state';
    state.textContent = STATE_LABELS[result.status];
    row.append(name, state);
    li.appendChild(row);

    if (result.reason) {
      const reason = document.createElement('div');
      reason.className = 'reason';
      reason.textContent = result.reason;
      li.appendChild(reason);
    }

    if (result.value && result.status !== 'filled') {
      const value = document.createElement('div');
      value.className = 'value';
      value.textContent = result.value;
      li.appendChild(value);
    }

    if (result.value) {
      const actions = document.createElement('div');
      actions.className = 'actions';

      const copy = document.createElement('button');
      copy.className = 'act';
      copy.type = 'button';
      copy.textContent = 'Kopieren';
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(result.value!);
          copy.textContent = 'Kopiert ✓';
        } catch {
          // Clipboard access can be denied; fall back to a selectable prompt.
          copy.textContent = 'Kopieren nicht erlaubt';
        }
        setTimeout(() => (copy.textContent = 'Kopieren'), 1600);
      });
      actions.appendChild(copy);

      if (result.status === 'not-found') {
        const teach = document.createElement('button');
        teach.className = 'act';
        teach.type = 'button';
        teach.textContent = 'Feld zuordnen';
        teach.title = 'Klicke danach das passende Formularfeld auf der Seite an.';
        teach.addEventListener('click', () => {
          void this.handlers.onTeachField(result.field);
        });
        actions.appendChild(teach);
      }

      li.appendChild(actions);
    }

    return li;
  }

  private footer(state: AssistPanelState): HTMLElement {
    const footer = document.createElement('footer');

    const note = document.createElement('div');
    note.className = 'note';
    note.textContent =
      'Bitte alle Felder prüfen und die Anzeige selbst veröffentlichen. Die Erweiterung sendet nichts ab.';
    footer.appendChild(note);

    const urlInput = document.createElement('input');
    urlInput.className = 'url';
    urlInput.type = 'url';
    urlInput.placeholder = 'Willhaben-URL der veröffentlichten Anzeige';
    urlInput.value = location.href;
    footer.appendChild(urlInput);

    const buttons = document.createElement('div');
    buttons.className = 'buttons';

    const confirm = document.createElement('button');
    confirm.className = 'act primary';
    confirm.type = 'button';
    confirm.textContent = 'Als gelistet bestätigen';
    confirm.addEventListener('click', async () => {
      confirm.disabled = true;
      confirm.textContent = 'Speichere…';
      try {
        await this.handlers.onConfirmListed(urlInput.value.trim());
        confirm.textContent = 'Gespeichert ✓';
      } catch (err) {
        confirm.textContent = err instanceof Error ? err.message : 'Fehler';
      } finally {
        setTimeout(() => {
          confirm.disabled = false;
          confirm.textContent = 'Als gelistet bestätigen';
        }, 2000);
      }
    });

    const retry = document.createElement('button');
    retry.className = 'act';
    retry.type = 'button';
    retry.textContent = state.formDetected ? 'Erneut ausfüllen' : 'Erneut versuchen';
    retry.addEventListener('click', () => this.handlers.onRetry());

    buttons.append(confirm, retry);
    footer.appendChild(buttons);

    const dash = document.createElement('button');
    dash.className = 'act';
    dash.type = 'button';
    dash.textContent = 'Produktkatalog öffnen';
    dash.addEventListener('click', () => this.handlers.onOpenDashboard());
    footer.appendChild(dash);

    return footer;
  }
}

/**
 * Lets the user point at the control an unmatched field belongs to. Returns the
 * clicked element, or null when the user pressed Escape.
 */
export function pickElement(): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    let current: HTMLElement | null = null;

    const over = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (current) current.classList.remove('teaching');
      if (target && target !== document.body) {
        current = target;
        current.classList.add('teaching');
      }
    };

    const click = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      cleanup();
      resolve((e.target as HTMLElement) ?? null);
    };

    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      cleanup();
      resolve(null);
    };

    function cleanup() {
      if (current) current.classList.remove('teaching');
      document.removeEventListener('mouseover', over, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('keydown', key, true);
      document.body.style.cursor = '';
    }

    document.body.style.cursor = 'crosshair';
    document.addEventListener('mouseover', over, true);
    document.addEventListener('click', click, true);
    document.addEventListener('keydown', key, true);
  });
}

/** Builds a reasonably stable selector for a user-taught element. */
export function selectorFor(el: HTMLElement): string | null {
  const id = el.getAttribute('id');
  if (id) {
    const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id;
    return `#${escaped}`;
  }
  const name = el.getAttribute('name');
  if (name) return `${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
  const testId = el.getAttribute('data-testid');
  if (testId) return `[data-testid="${CSS.escape(testId)}"]`;
  const aria = el.getAttribute('aria-label');
  if (aria) return `${el.tagName.toLowerCase()}[aria-label="${CSS.escape(aria)}"]`;
  return null;
}
