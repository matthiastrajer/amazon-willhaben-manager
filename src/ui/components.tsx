import {
  useEffect,
  useId,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import { PRODUCT_STATUS_META, type ProductStatus } from '@/core/models/Product';
import { formatCurrency, formatPercent, formatSignedCurrency, parseNumber } from '@/core/utils/format';
import { ImageOff, X } from 'lucide-react';

/* ------------------------------------------------------------------- badges */

export function StatusBadge({ status }: { status: ProductStatus }) {
  const meta = PRODUCT_STATUS_META[status];
  return (
    <span className={`badge badge-${meta.tone}`} title={meta.description}>
      {meta.label}
    </span>
  );
}

export function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone ? `badge-${tone}` : 'badge-plain'}`}>{children}</span>;
}

/* -------------------------------------------------------------------- money */

export function Money({
  value,
  currency = 'EUR',
  signed = false,
  colored = false,
}: {
  value: number | undefined | null;
  currency?: string;
  signed?: boolean;
  colored?: boolean;
}) {
  const text = signed ? formatSignedCurrency(value, currency) : formatCurrency(value, currency);
  const cls =
    colored && typeof value === 'number' && value !== 0 ? (value > 0 ? 'pos' : 'neg') : '';
  return <span className={`tabular ${cls}`}>{text}</span>;
}

export function Percent({ value, colored = false }: { value: number | undefined; colored?: boolean }) {
  const cls = colored && typeof value === 'number' && value !== 0 ? (value > 0 ? 'pos' : 'neg') : '';
  return <span className={`tabular ${cls}`}>{formatPercent(value)}</span>;
}

/* --------------------------------------------------------------------- stat */

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'pos' | 'neg';
}) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${tone ?? ''}`}>{value}</span>
      {hint ? <span className="stat-hint">{hint}</span> : null}
    </div>
  );
}

/* -------------------------------------------------------------------- alert */

export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warn' | 'err' | 'ok';
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`alert alert-${tone}`}>
      <div>
        {title ? <strong>{title}</strong> : null}
        {children}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- empty */

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

/* -------------------------------------------------------------------- modal */

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div className={`modal ${wide ? 'modal-lg' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <h2 className="card-title">{title}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Schließen">
            <X size={15} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- fields */

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : null}
      {!error && hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <input
      className="input"
      type={type}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
    />
  );
}

/**
 * Money input that keeps the user's raw text while typing (so "12," is not
 * destroyed mid-edit) and reports the parsed number.
 */
export function MoneyInput({
  value,
  onChange,
  placeholder = '0,00',
  disabled,
}: {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(() => (value === undefined ? '' : formatPlain(value)));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (focused) return;
    setText(value === undefined ? '' : formatPlain(value));
  }, [value, focused]);

  return (
    <input
      className="input tabular"
      type="text"
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        const parsed = parseNumber(text);
        setText(parsed === undefined ? '' : formatPlain(parsed));
      }}
      onChange={(e) => {
        setText(e.target.value);
        const parsed = parseNumber(e.target.value);
        onChange(e.target.value.trim() === '' ? undefined : parsed);
      }}
    />
  );
}

function formatPlain(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

export function NumberInput({
  value,
  onChange,
  min = 0,
  max,
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  return (
    <input
      className="input tabular"
      type="number"
      value={String(value)}
      min={min}
      max={max}
      disabled={disabled}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) onChange(n);
      }}
    />
  );
}

export function TextArea({
  value,
  onChange,
  rows = 5,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      className="textarea"
      rows={rows}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  disabled,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  disabled?: boolean;
}) {
  return (
    <select
      className="select"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
}) {
  const id = useId();
  return (
    <label className="checkbox" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/* ----------------------------------------------------------------- segments */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="segment" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={value === o.value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------- chart */

export interface BarDatum {
  label: string;
  value: number;
  display?: string;
}

/**
 * Minimal horizontal bar chart. Bars are scaled against the largest absolute
 * value so negative months read correctly instead of disappearing.
 */
export function BarChart({ data, formatValue }: { data: BarDatum[]; formatValue?: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  return (
    <div className="chart">
      {data.map((d) => (
        <div className="chart-row" key={d.label}>
          <span className="chart-label">{d.label}</span>
          <div className="chart-track">
            <div
              className={`chart-bar ${d.value < 0 ? 'neg' : ''}`}
              style={{ width: `${Math.max(1, (Math.abs(d.value) / max) * 100)}%` }}
            />
          </div>
          <span className="chart-value">
            {d.display ?? (formatValue ? formatValue(d.value) : formatCurrency(d.value))}
          </span>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------- image */

/**
 * Product thumbnail with a graceful fallback. Amazon image URLs can expire or
 * be blocked, so a broken image must never leave a torn layout behind.
 */
export function ProductImage({
  src,
  alt,
  size = 56,
  radius = 'var(--radius)',
}: {
  src?: string;
  alt: string;
  size?: number | string;
  radius?: string;
}) {
  const [failed, setFailed] = useState(false);
  const style = {
    width: typeof size === 'number' ? `${size}px` : size,
    height: typeof size === 'number' ? `${size}px` : size,
    borderRadius: radius,
    background: 'var(--surface-3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
    color: 'var(--text-subtle)',
  } as const;

  if (!src || failed) {
    return (
      <div style={style} title={alt}>
        <ImageOff size={16} />
      </div>
    );
  }

  return (
    <div style={style}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onError={() => setFailed(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ spinner */

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="row" style={{ gap: 'var(--space-2)' }}>
      <span className="spinner" />
      {label ? <span className="muted">{label}</span> : null}
    </div>
  );
}
