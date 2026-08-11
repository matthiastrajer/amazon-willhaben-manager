import { useState } from 'react';
import { Plus, Star, Trash2 } from 'lucide-react';
import type { Store } from '@/ui/useStore';
import type { Template } from '@/core/models/Template';
import { TemplateService } from '@/core/services/TemplateService';
import { CONDITIONS, CONDITION_LABELS, type Condition } from '@/core/models/Product';
import { CATEGORY_MAPPINGS } from '@/core/services/categoryMappings';
import {
  Alert,
  Badge,
  EmptyState,
  Field,
  Modal,
  MoneyInput,
  NumberInput,
  Select,
  TextArea,
  TextInput,
} from '@/ui/components';

export function Templates({ store }: { store: Store }) {
  const [editing, setEditing] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Vorlagen</h1>
          <div className="sub">Standardwerte für Preisaufschlag, Zustand, Versand und Kategorie</div>
        </div>
        <div className="actions">
          <button className="btn btn-primary" type="button" onClick={() => setCreating(true)}>
            <Plus size={14} /> Vorlage erstellen
          </button>
        </div>
      </div>

      <div className="page">
        {error ? <Alert tone="err">{error}</Alert> : null}

        <Alert tone="info">
          Beim Import eines Amazon-Produkts wird automatisch die Vorlage vorgeschlagen, deren
          Kategorie am besten zur erkannten Amazon-Kategorie passt.
        </Alert>

        {store.templates.length === 0 ? (
          <div className="card">
            <EmptyState
              title="Keine Vorlagen"
              action={
                <button className="btn btn-primary" type="button" onClick={() => setCreating(true)}>
                  <Plus size={14} /> Vorlage erstellen
                </button>
              }
            >
              Vorlagen bündeln Aufschlag, Mindestgewinn, Zustand und Kategorie für eine Produktgruppe.
            </EmptyState>
          </div>
        ) : (
          <div className="grid grid-2">
            {store.templates.map((t) => (
              <section className="card" key={t.id}>
                <div className="card-header">
                  <span className="card-title">
                    {t.name} {t.isDefault ? <Badge tone="listed">Standard</Badge> : null}
                  </span>
                  <div className="row" style={{ gap: 4 }}>
                    {!t.isDefault ? (
                      <button
                        className="btn btn-ghost btn-sm"
                        type="button"
                        title="Als Standard setzen"
                        onClick={() => void run(() => TemplateService.update(t.id, { isDefault: true }))}
                      >
                        <Star size={14} />
                      </button>
                    ) : null}
                    <button className="btn btn-sm" type="button" onClick={() => setEditing(t)}>
                      Bearbeiten
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      type="button"
                      title="Löschen"
                      onClick={() => {
                        if (window.confirm(`Vorlage „${t.name}“ löschen?`)) {
                          void run(() => TemplateService.remove(t.id));
                        }
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="card-body">
                  <dl className="kv">
                    <dt>Zustand</dt>
                    <dd className="wide">{CONDITION_LABELS[t.condition]}</dd>
                    <dt>Aufschlag</dt>
                    <dd className="wide">
                      {t.targetMargin
                        ? `Zielmarge ${t.targetMargin} %`
                        : `${t.markupPercent ?? 0} %${t.markupFixed ? ` + ${t.markupFixed} €` : ''}`}
                    </dd>
                    <dt>Mindestgewinn</dt>
                    <dd className="wide">{t.minProfit ?? 0} €</dd>
                    <dt>Versand</dt>
                    <dd className="wide">
                      {[t.shipping, t.pickup ? 'Abholung möglich' : null].filter(Boolean).join(' · ') || '–'}
                    </dd>
                    <dt>Kategorie</dt>
                    <dd className="wide">{t.categoryPath?.join(' → ') ?? '–'}</dd>
                    {t.descriptionTemplate ? (
                      <>
                        <dt>Beschreibung</dt>
                        <dd className="wide muted">{t.descriptionTemplate.slice(0, 80)}…</dd>
                      </>
                    ) : null}
                  </dl>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {creating || editing ? (
        <TemplateDialog
          template={editing ?? undefined}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      ) : null}
    </>
  );
}

/** Distinct Willhaben category paths offered by the central mapping table. */
const CATEGORY_OPTIONS = [
  { value: '', label: 'Keine Kategorie' },
  ...Array.from(new Set(CATEGORY_MAPPINGS.map((m) => m.path.join(' → ')))).map((p) => ({
    value: p,
    label: p,
  })),
];

function TemplateDialog({ template, onClose }: { template?: Template; onClose: () => void }) {
  const [name, setName] = useState(template?.name ?? '');
  const [condition, setCondition] = useState<Condition>(template?.condition ?? 'NEU');
  const [markupPercent, setMarkupPercent] = useState(template?.markupPercent ?? 30);
  const [markupFixed, setMarkupFixed] = useState<number | undefined>(template?.markupFixed ?? 0);
  const [targetMargin, setTargetMargin] = useState(template?.targetMargin ?? 0);
  const [minProfit, setMinProfit] = useState<number | undefined>(template?.minProfit ?? 5);
  const [shipping, setShipping] = useState(template?.shipping ?? 'Versand möglich');
  const [pickup, setPickup] = useState(template?.pickup ?? true);
  const [categoryPath, setCategoryPath] = useState(template?.categoryPath?.join(' → ') ?? '');
  const [titleSuffix, setTitleSuffix] = useState(template?.titleSuffix ?? '');
  const [descriptionTemplate, setDescriptionTemplate] = useState(template?.descriptionTemplate ?? '');
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      setError('Bitte einen Namen vergeben.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        condition,
        markupPercent,
        markupFixed: markupFixed ?? 0,
        targetMargin,
        minProfit: minProfit ?? 0,
        shipping: shipping.trim() || undefined,
        pickup,
        categoryPath: categoryPath ? categoryPath.split(' → ') : undefined,
        titleSuffix: titleSuffix.trim() || undefined,
        descriptionTemplate: descriptionTemplate.trim() || undefined,
      };
      if (template) await TemplateService.update(template.id, payload);
      else await TemplateService.create(payload);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={template ? 'Vorlage bearbeiten' : 'Neue Vorlage'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn btn-primary" type="button" onClick={() => void save()} disabled={saving}>
            Speichern
          </button>
        </>
      }
    >
      {error ? <Alert tone="err">{error}</Alert> : null}

      <Field label="Name *">
        <TextInput value={name} onChange={setName} placeholder="z. B. Standard Fitness" />
      </Field>

      <div className="grid grid-2">
        <Field label="Zustand">
          <Select
            value={condition}
            onChange={setCondition}
            options={CONDITIONS.map((c) => ({ value: c, label: CONDITION_LABELS[c] }))}
          />
        </Field>
        <Field label="Kategorie (Willhaben)">
          <Select value={categoryPath} onChange={setCategoryPath} options={CATEGORY_OPTIONS} />
        </Field>
      </div>

      <div className="grid grid-2">
        <Field label="Aufschlag %" hint="Wird ignoriert, wenn eine Zielmarge gesetzt ist.">
          <NumberInput value={markupPercent} onChange={setMarkupPercent} min={0} />
        </Field>
        <Field label="Fixer Aufschlag">
          <MoneyInput value={markupFixed} onChange={setMarkupFixed} />
        </Field>
        <Field label="Zielmarge %" hint="0 = deaktiviert">
          <NumberInput value={targetMargin} onChange={setTargetMargin} min={0} max={95} />
        </Field>
        <Field label="Mindestgewinn">
          <MoneyInput value={minProfit} onChange={setMinProfit} />
        </Field>
      </div>

      <div className="grid grid-2">
        <Field label="Versand">
          <TextInput value={shipping} onChange={setShipping} />
        </Field>
        <Field label="Abholung">
          <Select
            value={pickup ? 'ja' : 'nein'}
            onChange={(v) => setPickup(v === 'ja')}
            options={[
              { value: 'ja', label: 'Abholung möglich' },
              { value: 'nein', label: 'Keine Abholung' },
            ]}
          />
        </Field>
      </div>

      <Field label="Titel-Zusatz" hint='Wird an den generierten Titel angehängt, z. B. "Neu & OVP".'>
        <TextInput value={titleSuffix} onChange={setTitleSuffix} />
      </Field>

      <Field
        label="Beschreibungs-Vorlage"
        hint="Platzhalter: {{title}}, {{brand}}, {{features}}, {{condition}}, {{color}}, {{size}}, {{weight}}. Leer lassen für die automatische Beschreibung."
      >
        <TextArea value={descriptionTemplate} onChange={setDescriptionTemplate} rows={6} />
      </Field>
    </Modal>
  );
}
