import { CONTENT_TOKENS, createShadowUi, type ShadowUi } from '../shared/shadowHost';

const HOST_ID = 'awm-amazon-floating-button';

const CSS = `
${CONTENT_TOKENS}
.awm-root {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 2147483000;
}
button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 11px 16px;
  border: none;
  border-radius: 999px;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  color: #fff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--awm-shadow);
  transition: transform .12s ease, box-shadow .12s ease;
}
button:hover { transform: translateY(-1px); }
button:active { transform: translateY(0); }
button:disabled { opacity: .7; cursor: default; transform: none; }
.arrow { font-size: 16px; line-height: 1; }
.status {
  margin-top: 8px;
  max-width: 260px;
  padding: 10px 12px;
  border-radius: var(--awm-radius);
  background: var(--awm-bg);
  border: 1px solid var(--awm-border);
  box-shadow: var(--awm-shadow);
  font-size: 13px;
}
.status.ok { border-left: 3px solid var(--awm-ok); }
.status.err { border-left: 3px solid var(--awm-err); }
.status button.link {
  background: none; padding: 0; margin-top: 6px; color: var(--awm-brand);
  box-shadow: none; font-weight: 600; text-decoration: underline;
}
.hide { display: none; }
`;

export interface FloatingButtonHandlers {
  onPrepare(): Promise<{ message: string; ok: boolean; openDashboard?: boolean }>;
  onOpenDashboard(): void;
}

let ui: ShadowUi | null = null;

/** Shows the "→ Willhaben" affordance on an Amazon product page. */
export function mountFloatingButton(handlers: FloatingButtonHandlers): void {
  if (ui) return;
  ui = createShadowUi(HOST_ID, CSS);

  const button = document.createElement('button');
  button.type = 'button';
  button.innerHTML = '<span class="arrow">→</span><span class="label">Willhaben vorbereiten</span>';

  const status = document.createElement('div');
  status.className = 'status hide';

  const label = button.querySelector('.label') as HTMLSpanElement;

  button.addEventListener('click', async () => {
    button.disabled = true;
    label.textContent = 'Analysiere…';
    status.className = 'status hide';
    try {
      const result = await handlers.onPrepare();
      status.className = `status ${result.ok ? 'ok' : 'err'}`;
      status.textContent = result.message;
      if (result.openDashboard) {
        const link = document.createElement('button');
        link.className = 'link';
        link.type = 'button';
        link.textContent = 'Im Produktkatalog öffnen';
        link.addEventListener('click', () => handlers.onOpenDashboard());
        status.appendChild(link);
      }
    } catch (err) {
      status.className = 'status err';
      status.textContent = err instanceof Error ? err.message : String(err);
    } finally {
      button.disabled = false;
      label.textContent = 'Willhaben vorbereiten';
    }
  });

  ui.container.append(button, status);
}

export function unmountFloatingButton(): void {
  ui?.destroy();
  ui = null;
}
