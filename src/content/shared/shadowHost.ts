/**
 * Creates an isolated UI root inside a closed-off shadow tree.
 *
 * Content-script UI must not inherit or leak page styles. A shadow root gives
 * full isolation in both directions, which matters on pages as heavily styled
 * as Amazon and Willhaben.
 */
export interface ShadowUi {
  host: HTMLDivElement;
  root: ShadowRoot;
  container: HTMLDivElement;
  destroy(): void;
}

export function createShadowUi(id: string, css: string): ShadowUi {
  document.getElementById(id)?.remove();

  const host = document.createElement('div');
  host.id = id;
  // The host itself must be inert so it never shifts the page layout.
  host.style.cssText = 'all: initial; position: static;';

  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = css;
  root.appendChild(style);

  const container = document.createElement('div');
  container.className = 'awm-root';
  root.appendChild(container);

  document.documentElement.appendChild(host);

  return {
    host,
    root,
    container,
    destroy: () => host.remove(),
  };
}

/** Shared design tokens for content-script UI, kept in sync with the app CSS. */
export const CONTENT_TOKENS = `
:host, .awm-root {
  --awm-bg: #ffffff;
  --awm-surface: #f8fafc;
  --awm-border: #e2e8f0;
  --awm-text: #0f172a;
  --awm-muted: #64748b;
  --awm-brand: #4f46e5;
  --awm-brand-strong: #4338ca;
  --awm-ok: #059669;
  --awm-warn: #d97706;
  --awm-err: #dc2626;
  --awm-radius: 12px;
  --awm-shadow: 0 10px 30px rgba(15, 23, 42, 0.18);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 14px;
  line-height: 1.45;
  color: var(--awm-text);
  box-sizing: border-box;
}
.awm-root *, .awm-root *::before, .awm-root *::after { box-sizing: border-box; }
@media (prefers-color-scheme: dark) {
  :host, .awm-root {
    --awm-bg: #0f172a;
    --awm-surface: #1e293b;
    --awm-border: #334155;
    --awm-text: #f1f5f9;
    --awm-muted: #94a3b8;
    --awm-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  }
}
`;
