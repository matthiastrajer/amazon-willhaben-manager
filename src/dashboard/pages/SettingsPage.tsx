import { useEffect, useRef, useState } from 'react';
import { Download, Upload, RotateCcw, Trash2 } from 'lucide-react';
import type { Store } from '@/ui/useStore';
import { CONDITIONS, CONDITION_LABELS, type Condition } from '@/core/models/Product';
import type { ThemeMode } from '@/core/models/Settings';
import { SettingsService } from '@/core/services/SettingsService';
import { StorageService } from '@/core/services/StorageService';
import { ExportService, downloadTextFile } from '@/core/services/ExportService';
import { calculateSuggestedPrice, rulesFrom } from '@/core/services/PriceCalculator';
import { formatCurrency, todayISODate } from '@/core/utils/format';
import { STORAGE_KEYS } from '@/shared/constants';
import {
  Alert,
  Checkbox,
  Field,
  Money,
  MoneyInput,
  NumberInput,
  Select,
  TextArea,
  TextInput,
} from '@/ui/components';

export function SettingsPage({ store }: { store: Store }) {
  const s = store.settings;
  const [message, setMessage] = useState<{ tone: 'ok' | 'err' | 'warn'; text: string } | null>(null);
  const [usage, setUsage] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void StorageService.usage().then(setUsage);
  }, [store.products, store.sales]);

  const update = async (patch: Parameters<typeof SettingsService.update>[0]) => {
    try {
      await SettingsService.update(patch);
      setMessage(null);
    } catch (err) {
      setMessage({ tone: 'err', text: err instanceof Error ? err.message : String(err) });
    }
  };

  // Live preview so the pricing rules are never abstract.
  const example = calculateSuggestedPrice(
    { purchasePrice: 9.99, purchaseShipping: 0, purchaseOtherCosts: 0 },
    rulesFrom(s, null),
  );

  const exportBackup = async () => {
    const backup = await ExportService.createBackup();
    downloadTextFile(
      `awm-backup-${todayISODate()}.json`,
      JSON.stringify(backup, null, 2),
      'application/json',
    );
    setMessage({ tone: 'ok', text: 'Backup wurde heruntergeladen.' });
  };

  const importBackup = async (file: File, mode: 'replace' | 'merge') => {
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const validation = ExportService.validateBackup(parsed);
      if (!validation.ok) {
        setMessage({ tone: 'err', text: validation.error });
        return;
      }
      await ExportService.restoreBackup(validation.backup, mode);
      setMessage({
        tone: 'ok',
        text: `Backup wiederhergestellt: ${validation.backup.products.length} Produkte, ${validation.backup.sales.length} Verkäufe.`,
      });
    } catch (err) {
      setMessage({ tone: 'err', text: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Einstellungen</h1>
          <div className="sub">Preisregeln, Standardwerte, Datensicherung</div>
        </div>
      </div>

      <div className="page">
        {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}

        <section className="card">
          <div className="card-header">
            <span className="card-title">Preiskalkulation</span>
          </div>
          <div className="card-body col">
            <div className="grid grid-3">
              <Field label="Standard-Aufschlag %" hint="Wird ignoriert, wenn eine Zielmarge gesetzt ist.">
                <NumberInput
                  value={s.defaultMarkupPercent}
                  onChange={(v) => void update({ defaultMarkupPercent: v })}
                  min={0}
                />
              </Field>
              <Field label="Fixer Aufschlag">
                <MoneyInput
                  value={s.defaultMarkupFixed}
                  onChange={(v) => void update({ defaultMarkupFixed: v ?? 0 })}
                />
              </Field>
              <Field label="Mindestgewinn">
                <MoneyInput value={s.minProfit} onChange={(v) => void update({ minProfit: v ?? 0 })} />
              </Field>
              <Field label="Zielmarge %" hint="0 = deaktiviert (dann gilt der Aufschlag).">
                <NumberInput
                  value={s.targetMargin}
                  onChange={(v) => void update({ targetMargin: v })}
                  min={0}
                  max={95}
                />
              </Field>
              <Field label="Währung">
                <Select
                  value={s.currency}
                  onChange={(v) => void update({ currency: v })}
                  options={[
                    { value: 'EUR', label: 'Euro (€)' },
                    { value: 'USD', label: 'US-Dollar ($)' },
                    { value: 'CHF', label: 'Schweizer Franken' },
                  ]}
                />
              </Field>
            </div>
            <Checkbox
              checked={s.roundPrices}
              onChange={(v) => void update({ roundPrices: v })}
              label="Preise auf „…,99“ aufrunden"
            />
            <Alert tone="info" title="Beispiel">
              Einkauf {formatCurrency(9.99, s.currency)} → Vorschlag{' '}
              <strong>{formatCurrency(example.price, s.currency)}</strong> · erwarteter Gewinn{' '}
              <Money value={example.expectedProfit} currency={s.currency} signed colored /> · Marge{' '}
              {example.expectedMargin.toFixed(1)} %
            </Alert>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <span className="card-title">Anzeigen-Standardwerte</span>
          </div>
          <div className="card-body col">
            <div className="grid grid-3">
              <Field label="Standard-Zustand">
                <Select
                  value={s.defaultCondition}
                  onChange={(v: Condition) => void update({ defaultCondition: v })}
                  options={CONDITIONS.map((c) => ({ value: c, label: CONDITION_LABELS[c] }))}
                />
              </Field>
              <Field label="Standard-PLZ">
                <TextInput
                  value={s.defaultPostalCode}
                  onChange={(v) => void update({ defaultPostalCode: v })}
                  placeholder="1010"
                />
              </Field>
              <Field label="Standard-Ort">
                <TextInput
                  value={s.defaultLocation}
                  onChange={(v) => void update({ defaultLocation: v })}
                  placeholder="Wien"
                />
              </Field>
              <Field label="Standard-Versand">
                <TextInput value={s.defaultShipping} onChange={(v) => void update({ defaultShipping: v })} />
              </Field>
              <Field label="Max. Bilder pro Anzeige">
                <NumberInput value={s.maxImages} onChange={(v) => void update({ maxImages: v })} min={1} max={20} />
              </Field>
            </div>

            <Checkbox
              checked={s.defaultPickup}
              onChange={(v) => void update({ defaultPickup: v })}
              label="Abholung standardmäßig anbieten"
            />

            <Field label="Standard-Textbaustein" hint="Wird an jede generierte Beschreibung angehängt.">
              <TextArea
                value={s.defaultDescription}
                onChange={(v) => void update({ defaultDescription: v })}
                rows={3}
              />
            </Field>

            <Field
              label="Willhaben-Startseite für neue Anzeigen"
              hint="Falls Willhaben seine Adresse ändert, kann sie hier angepasst werden. Das Formular wird anhand seiner Felder erkannt, nicht anhand dieser URL."
            >
              <TextInput
                value={s.willhabenCreateUrl}
                onChange={(v) => void update({ willhabenCreateUrl: v })}
              />
            </Field>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <span className="card-title">Automatisierung & Oberfläche</span>
          </div>
          <div className="card-body col">
            <Checkbox
              checked={s.autoOptimizeTitle}
              onChange={(v) => void update({ autoOptimizeTitle: v })}
              label="Titel automatisch für die Anzeige optimieren"
            />
            <Checkbox
              checked={s.autoGenerateDescription}
              onChange={(v) => void update({ autoGenerateDescription: v })}
              label="Beschreibung automatisch generieren"
            />
            <Checkbox
              checked={s.compactDescription}
              onChange={(v) => void update({ compactDescription: v })}
              label="Kurze Beschreibung (Stichpunkte statt Volltext)"
            />
            <Checkbox
              checked={s.onlyCoreFields}
              onChange={(v) => void update({ onlyCoreFields: v })}
              label="Nur Verkaufspreis, Titel und Beschreibung übernehmen"
            />
            <Checkbox
              checked={s.autoPrepareImages}
              onChange={(v) => void update({ autoPrepareImages: v })}
              label="Bilder automatisch für die Anzeige vorauswählen"
            />
            <Checkbox
              checked={s.floatingButton}
              onChange={(v) => void update({ floatingButton: v })}
              label="Schaltfläche auf Amazon-Produktseiten anzeigen"
            />
            <Checkbox
              checked={s.contextMenu}
              onChange={(v) => void update({ contextMenu: v })}
              label="Eintrag im Rechtsklick-Menü auf Amazon anzeigen"
            />
            <Checkbox
              checked={s.debugMode}
              onChange={(v) => void update({ debugMode: v })}
              label="Debug-Modus (zeigt Herkunft jedes erkannten Feldes)"
            />
            <Field label="Design">
              <Select
                value={s.theme}
                onChange={(v: ThemeMode) => void update({ theme: v })}
                options={[
                  { value: 'system', label: 'Systemeinstellung' },
                  { value: 'light', label: 'Hell' },
                  { value: 'dark', label: 'Dunkel' },
                ]}
              />
            </Field>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <span className="card-title">Daten & Backup</span>
          </div>
          <div className="card-body col">
            <Alert tone="info">
              Alle Daten liegen ausschließlich lokal in diesem Browserprofil. Es werden keine Daten an
              Server übertragen, es gibt kein Tracking und keine Analytics.
              {usage !== null ? ` Belegter Speicher: ${(usage / 1024).toFixed(1)} KB.` : ''}
            </Alert>

            <div className="row wrap">
              <button className="btn" type="button" onClick={() => void exportBackup()}>
                <Download size={14} /> Backup erstellen (JSON)
              </button>
              <button
                className="btn"
                type="button"
                onClick={() =>
                  downloadTextFile(
                    `produkte-${todayISODate()}.csv`,
                    ExportService.productsToCsv(store.products, store.sales, store.listings),
                    'text/csv',
                  )
                }
                disabled={store.products.length === 0}
              >
                <Download size={14} /> Produkte als CSV
              </button>
              <button
                className="btn"
                type="button"
                onClick={() =>
                  downloadTextFile(
                    `verkaeufe-${todayISODate()}.csv`,
                    ExportService.salesToCsv(store.sales, store.products),
                    'text/csv',
                  )
                }
                disabled={store.sales.length === 0}
              >
                <Download size={14} /> Verkäufe als CSV
              </button>
              <button
                className="btn"
                type="button"
                onClick={() =>
                  downloadTextFile(
                    `produkte-${todayISODate()}.json`,
                    JSON.stringify(store.products, null, 2),
                    'application/json',
                  )
                }
                disabled={store.products.length === 0}
              >
                <Download size={14} /> Produkte als JSON
              </button>
            </div>

            <Alert tone="warn" title="Backup wiederherstellen">
              Ein Backup kann bestehende Daten überschreiben. „Ersetzen“ löscht den aktuellen Bestand,
              „Zusammenführen“ ergänzt nur unbekannte Einträge.
            </Alert>

            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                const mode = fileRef.current?.dataset.mode === 'merge' ? 'merge' : 'replace';
                if (file) void importBackup(file, mode);
                e.target.value = '';
              }}
            />
            <div className="row wrap">
              <button
                className="btn"
                type="button"
                onClick={() => {
                  if (fileRef.current) {
                    fileRef.current.dataset.mode = 'merge';
                    fileRef.current.click();
                  }
                }}
              >
                <Upload size={14} /> Backup zusammenführen
              </button>
              <button
                className="btn btn-danger"
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      'Backup importieren und alle aktuellen Daten ersetzen? Diese Aktion kann nicht rückgängig gemacht werden.',
                    )
                  ) {
                    if (fileRef.current) {
                      fileRef.current.dataset.mode = 'replace';
                      fileRef.current.click();
                    }
                  }
                }}
              >
                <Upload size={14} /> Backup importieren (ersetzen)
              </button>
            </div>

            <div className="row wrap">
              <button
                className="btn"
                type="button"
                onClick={() => {
                  if (window.confirm('Alle Einstellungen auf die Standardwerte zurücksetzen?')) {
                    void SettingsService.reset();
                  }
                }}
              >
                <RotateCcw size={14} /> Einstellungen zurücksetzen
              </button>
              <button
                className="btn btn-danger"
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      'Wirklich ALLE Daten löschen (Produkte, Verkäufe, Anzeigen, Vorlagen, Einstellungen)?',
                    ) &&
                    window.confirm('Letzte Warnung: Es wird nichts gesichert. Fortfahren?')
                  ) {
                    void (async () => {
                      await StorageService.remove(Object.values(STORAGE_KEYS));
                      setMessage({ tone: 'warn', text: 'Alle Daten wurden gelöscht.' });
                    })();
                  }
                }}
              >
                <Trash2 size={14} /> Alle Daten löschen
              </button>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <span className="card-title">Rechtliche Hinweise</span>
          </div>
          <div className="card-body col">
            <p className="pre muted" style={{ margin: 0 }}>
              Die Erweiterung liest ausschließlich sichtbare Inhalte einer bereits geöffneten
              Produktseite aus und füllt sichtbare Formularfelder vor. Sie veröffentlicht keine
              Anzeigen, umgeht keine Anmelde-, CAPTCHA- oder Schutzmechanismen und nutzt keine
              privaten Schnittstellen. Die Veröffentlichung einer Anzeige erfolgt immer durch dich.
              {'\n\n'}
              Produkttexte und Bilder von Amazon sind urheberrechtlich geschützt. Aus der technischen
              Übernahme in ein Formular folgt keine Erlaubnis zur kommerziellen Weiterverwendung –
              das ist im Einzelfall selbst zu prüfen.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
