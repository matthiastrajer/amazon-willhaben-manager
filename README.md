# Amazon → Willhaben Manager

Chrome-Erweiterung (Manifest V3), die zwei Dinge verbindet:

1. **Amazon-Produkte analysieren** und mit wenigen Klicks eine Willhaben-Anzeige vorbereiten.
2. **Reselling verwalten**: Produktkatalog, Bestand, Listings, Verkäufe, Gewinn, Marge, ROI und Statistiken.

Alle Daten bleiben lokal im Browserprofil. Kein Backend, kein Tracking, keine Analytics.

---

## Installation

```bash
npm install
npm run build
```

Danach in Chrome:

1. `chrome://extensions` öffnen
2. **Entwicklermodus** aktivieren
3. **„Entpackte Erweiterung laden"** klicken
4. den Ordner **`dist`** auswählen

### Weitere Befehle

| Befehl | Zweck |
| --- | --- |
| `npm run build` | Typecheck + Produktions-Build nach `dist/` (inkl. Verifikation) |
| `npm run build:only` | Build ohne vorherigen Typecheck |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest-Suite (147 Tests) |
| `npm run test:watch` | Tests im Watch-Modus |
| `npm run icons` | Icons neu generieren |
| `npm run zip` | `dist/` als ZIP für den Web Store packen |

---

## Der Workflow

```
Amazon-Produktseite
   ↓  Popup öffnen → „Produkt analysieren"
Produktdaten werden extrahiert und geprüft
   ↓  Einkaufs-/Verkaufspreis kontrollieren
„→ Willhaben vorbereiten"
   ↓  Produkt wird gespeichert (Status: BEREIT ZUM LISTEN)
Willhaben öffnet sich, Formular wird ausgefüllt
   ↓  Assistent zeigt, was übernommen wurde und was fehlt
Benutzer prüft alles und veröffentlicht SELBST
   ↓  „Als gelistet bestätigen" (URL wird gespeichert)
Status: GELISTET
   ↓  Produkt wird verkauft
„Als verkauft markieren" → echter Verkaufspreis + Kosten
   ↓
Gewinn, Marge und ROI werden berechnet
Dashboard und Statistiken aktualisieren sich
```

### Produktstatus

| Status | Bedeutung |
| --- | --- |
| 🟡 **ENTWURF** | Importiert bzw. angelegt |
| 🟠 **BEREIT ZUM LISTEN** | Willhaben-Formular vorbereitet – **nicht** bestätigt veröffentlicht |
| 🔵 **GELISTET** | Vom Benutzer bestätigt: Anzeige ist online |
| 🟢 **VERKAUFT** | Alle Einheiten verkauft |
| ⚪ **ARCHIVIERT** | Aus dem aktiven Bestand genommen |
| 🔴 **STORNIERT** | Einkauf storniert/retourniert |

`BEREIT ZUM LISTEN` existiert bewusst: die Erweiterung veröffentlicht nichts und
behauptet daher nie, eine Anzeige sei live. Das bestätigt der Benutzer.

---

## Gewinnberechnung

Ein Gewinn ist **nie** „Verkaufspreis − Amazonpreis". Gerechnet wird immer über
den vollständigen Kostenstapel (`src/core/services/ProfitCalculator.ts`):

```
Einkaufskosten (pro Stück) = Einkaufspreis + Einkaufsversand + sonstige Einkaufskosten
Verkaufskosten             = Gebühren + Versand + Verpackung + sonstige Kosten

Gewinn = Verkaufspreis − (Einkaufskosten × Menge) − Verkaufskosten
Marge  = Gewinn / Verkaufspreis   × 100
ROI    = Gewinn / Einkaufskosten  × 100
```

Beispiel aus der Testsuite: Einkauf 10 €, Verkauf 18 €, Versand 4 €
→ Gewinn **4 €**, Marge **22,22 %**, ROI **40 %**.

Die Oberfläche trennt konsequent:

- **Erwarteter Gewinn** – aus dem geplanten Verkaufspreis, ohne Verkaufskosten (klar so benannt).
- **Tatsächlicher Gewinn** – aus dem erfassten Verkauf inklusive aller Kosten.

Gewinn, Marge und ROI werden **nie gespeichert**, sondern immer aus den
Rohdaten berechnet — so können die Zahlen nicht auseinanderlaufen.

### Bestand

```
Gesamt     = gekaufte Menge (schrumpft nicht)
Verkauft   = Summe aller Verkaufsmengen aus dem Verkaufs-Ledger
Verfügbar  = Gesamt − Verkauft          (abgeleitet, nie gespeichert)
Gelistet   = min(gelistete Menge, Verfügbar)
Kapital    = Verfügbar × Einkaufskosten pro Stück
```

Mehrere Verkäufe desselben Produkts zu unterschiedlichen Preisen werden einzeln
erfasst und einzeln bewertet.

---

## Projektstruktur

```
src/
├── background/
│   └── service-worker.ts          MV3-Worker: Nachrichten, Kontextmenü, Tab-Orchestrierung
├── content/
│   ├── amazon/
│   │   ├── amazonSelectors.ts     zentrale Selektor-Kataloge mit Fallback-Ketten
│   │   ├── amazonExtractor.ts     Extraktion (JSON-LD → Meta → DOM), rein & testbar
│   │   ├── AmazonAdapter.ts       PlatformAdapter-Implementierung
│   │   ├── floatingButton.ts      optionale Schaltfläche auf Produktseiten
│   │   └── index.ts               Content-Script-Einstiegspunkt
│   ├── willhaben/
│   │   ├── willhabenSelectors.ts  semantische Feldprofile (keine CSS-Klassen!)
│   │   ├── fieldDiscovery.ts      Scoring-Engine für Formularfelder
│   │   ├── WillhabenFieldMapper.ts Produkt → Feldwerte + DOM-Schreiben
│   │   ├── willhabenDetector.ts   Formularerkennung, MutationObserver, Retry
│   │   ├── assistPanel.ts         Assistent-Overlay (Shadow DOM)
│   │   ├── WillhabenAdapter.ts    PlatformAdapter-Implementierung
│   │   └── index.ts               Content-Script-Einstiegspunkt
│   └── shared/shadowHost.ts       isolierte UI-Wurzel für Content Scripts
├── core/
│   ├── models/                    Product, Sale, Listing, Template, Settings
│   ├── services/                  Storage, Product, Sale, Listing, Duplicate,
│   │                              Price, Profit, Inventory, Template, Analytics,
│   │                              Export, categoryMappings, ListingContent
│   └── utils/                     Formatierung, Text-Normalisierung, IDs
├── popup/                         Erkennung, Analyse, Vorschau, Vorbereitung
├── dashboard/
│   ├── Dashboard.tsx              Shell + Hash-Router
│   ├── pages/                     Overview, Products, ProductDetail, Sales,
│   │                              Analytics, Templates, SettingsPage
│   └── components/                ProductForm, SaleDialog
├── ui/                            Design-Tokens, Komponenten, Store-Hook
└── shared/                        Nachrichten-Bus, Typen, Konstanten
```

### Technologien

- **Manifest V3**, TypeScript (strict), React 18, Vite 5
- **lucide-react** für Icons; sonst keine Laufzeit-Abhängigkeiten
- Diagramme sind eigenes CSS — keine Chart-Bibliothek
- Routing über `location.hash` — kein Router-Paket
- Tests: Vitest + jsdom, mit Mock-HTML für Amazon und Willhaben

### Berechtigungen

`storage`, `tabs`, `activeTab`, `scripting`, `contextMenus` sowie Host-Zugriff
ausschließlich auf `amazon.de`, `amazon.at`, `amazon.com` und `willhaben.at`.

---

## Wie die Formularerkennung funktioniert

Willhabens Anzeigenformular ist eine dynamisch gerenderte Anwendung mit
generierten CSS-Klassennamen. Auf solche Klassen zu zielen wäre sofort veraltet.

Deshalb enthält `willhabenSelectors.ts` **keine erfundenen CSS-Selektoren**,
sondern *semantische Profile*. `fieldDiscovery.ts` sammelt jedes sichtbare
Bedienelement und bewertet es anhand der Merkmale, die ein Formular unabhängig
vom Styling trägt:

| Signal | Gewicht |
| --- | --- |
| `<label for>` -Text | 10 |
| `aria-label` / `aria-labelledby` | 9 |
| `data-testid` | 7 |
| `name` | 6 |
| `id`, `placeholder` | 5 |
| umgebender Text | 3 |

Dazu kommen Ausschluss-Stichwörter (ein Suchfeld „Preis von" wird nie als
Preisfeld gewertet), Element-Art-Prüfungen und eine Mindestpunktzahl. Ein
Bedienelement wird nie zwei Feldern zugeordnet.

Die Testsuite prüft dieselbe Logik gegen **vier** unterschiedlich aufgebaute
Formular-Varianten (klassische Labels, nur `aria-label`, Framework-Markup mit
generierten Klassen, unvollständiges Formular).

Findet die Erkennung ein Feld trotzdem nicht, wird das im Assistenten klar
angezeigt — mit Kopierschaltfläche und der Möglichkeit, das richtige Feld per
Klick **selbst zuzuordnen** (die Zuordnung wird lokal gespeichert und danach
bevorzugt verwendet).

---

## Was die Erweiterung bewusst NICHT tut

- **Nichts veröffentlichen.** Kein Klick auf „Anzeige aufgeben", kein Formular-Submit.
- **Keine Schutzmechanismen umgehen** – kein CAPTCHA-Lösen, keine Bot-Erkennungs-
  oder Login-Umgehung, keine Rate-Limit-Tricks, keine privaten APIs.
- **Nichts bei Amazon bestellen oder bezahlen.**
- **Keine Eigenschaften erfinden.** Titel und Beschreibung entstehen ausschließlich
  aus tatsächlich extrahierten Daten; fehlt eine Angabe, entfällt der Block.
- **Interne Notizen** landen nie in der Anzeigenbeschreibung.

---

## Aktuelle technische Einschränkungen

1. **Bild-Upload ist manuell.** Ein `<input type="file">` lässt sich aus
   Sicherheitsgründen nicht programmatisch befüllen. Die Erweiterung bereitet die
   Bild-URLs auf und stellt sie zum Kopieren bereit; die Auswahl der Dateien
   erfolgt im Browser.

2. **Kategorie wird vorgeschlagen, nicht gesetzt.** Willhabens Kategorieauswahl ist
   ein mehrstufiger Dialog. Die Erweiterung mappt die Amazon-Kategorie über
   `categoryMappings.ts` und zeigt den Pfad an; ausgewählt wird er einmal manuell.

3. **Die Willhaben-Feldprofile wurden nicht gegen die Live-Seite verifiziert.**
   Amazon und Willhaben waren in der Entwicklungsumgebung netzwerkseitig nicht
   erreichbar, eine Live-DOM-Analyse war daher nicht möglich. Statt Selektoren zu
   erfinden, arbeitet die Erkennung rein semantisch (siehe oben) und meldet
   ehrlich, wenn ein Feld nicht gefunden wurde. Die Amazon-Selektoren zielen auf
   die langlebigen Element-IDs (`#productTitle`, `#landingImage`, `#ASIN`,
   `#feature-bullets`, …) und liegen ohnehin hinter JSON-LD und Meta-Tags als
   bevorzugten Quellen.

4. **Amazon-Preise sind Momentaufnahmen.** Der beim Import gelesene Preis wird als
   Einkaufspreis vorgeschlagen und kann jederzeit korrigiert werden.

5. **Rechtliches.** Produkttexte und Bilder von Amazon sind urheberrechtlich
   geschützt. Aus der technischen Übernahme in ein Formular folgt keine Erlaubnis
   zur kommerziellen Weiterverwendung.

---

## Sinnvolle nächste Erweiterungen

- Weitere Plattform-Adapter (eBay, Shpock, Vinted) – `PlatformAdapter` und das
  `Listing`-Modell sind bereits darauf ausgelegt, mehrere Anzeigen pro Produkt zu führen.
- Bulk-/CSV-Import für größere Wareneingänge.
- Preisverlauf und Konkurrenzbeobachtung für gelistete Produkte.
- Automatische Listing-Überwachung (ist die Anzeige noch online?).
- Optionale KI-Unterstützung für Titel und Beschreibung.

---

## Tests

```bash
npm test
```

147 Tests decken ab: Amazon-Extraktion (inkl. fehlender Felder, defektem JSON-LD,
Suchseiten), ASIN-/Preis-/Bild-Erkennung, Duplikaterkennung, Titel- und
Beschreibungsgenerierung, Kategorie-Mapping, Preis- und Gewinnberechnung
(inkl. Verlusten und Nullwerten), Storage inklusive gleichzeitiger Schreibzugriffe,
Bestand, Mehrfachverkäufe, Willhaben-Feldzuordnung gegen vier Formular-Varianten,
Analytics, CSV-Export, Backup/Restore und den vollständigen Lebenszyklus
Amazon → Willhaben → Verkauf → Dashboard.
