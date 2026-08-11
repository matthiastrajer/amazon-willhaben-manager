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
| `npm test` | Vitest-Suite (191 Tests) |
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

## Was in die Anzeige übernommen wird

Standardmäßig nur die drei Felder, die das Willhaben-Marktplatz-Formular
wirklich hat:

| Feld | Herkunft |
| --- | --- |
| **Verkaufspreis** | geplanter Verkaufspreis; ganze Beträge ohne Nachkommastellen (`79`, nicht `79,00` – das Preisfeld filtert das sonst weg) |
| **Titel** | Kernbegriff des Amazon-Titels, nicht 1:1 kopiert |
| **Beschreibung** | kurze Stichpunktliste, nur deutschsprachige Quelltexte |

Marke, Farbe, Größe, Zustand, PLZ und Ort werden bewusst **nicht** versucht: das
Formular hat keine solchen Felder, und der Kontaktblock wird von Willhaben aus
dem Konto gefüllt. Wer sie für ein anderes Formular braucht, schaltet in den
Einstellungen „Nur Verkaufspreis, Titel und Beschreibung übernehmen" ab.

### Titel-Kürzung

Ein Marktplatz-Titel wird gescannt, nicht gelesen. Aus

> YOLEO YOLEO klappbare Hantelbank Multifunktion Training Fitness Bank
> Bauchtrainer Schrägbank mit 6-Fach Verstellbarer Rückenlehne…

wird

> **YOLEO klappbare Hantelbank – Neu**

Die Regel nutzt die deutsche Großschreibung: Adjektive stehen vor dem Substantiv,
also endet der Produktname beim **ersten großgeschriebenen Wort** („klappbare
**Hantelbank**"). Bindewörter wie „für", „mit", „inkl." beenden die Phrase
ebenfalls. Ist ein Titel durchgehend groß geschrieben (typisch für englische
Titel), greift stattdessen eine Grenze von drei Wörtern. Es werden immer nur
Wörter **entfernt** – nie eines hinzugefügt.

### Beschreibung

Kurzform aus Kopfzeile, bis zu vier verdichteten Stichpunkten und dem Zustand.
Amazon-Bulletpoints beginnen meist mit einem geschrienen Schlagwort
(„MULTIFUNKTIONAL – Die Hantelbank lässt sich…"); das Schlagwort entfällt, wenn
ein echter Satz folgt, und der Rest wird an einer Wortgrenze gekürzt. Der
Wortlaut wird nie verändert, nur verkürzt. Über die Einstellung „Kurze
Beschreibung" lässt sich die ausführliche Variante zurückholen.

### Texte werden beim Vorbereiten neu erzeugt

Titel und Beschreibung liegen am Produkt. Ein Produkt, das mit einer älteren
Version importiert wurde, behielte sonst den damals erzeugten Text — verbesserte
Regeln und geänderte Einstellungen hätten keine Wirkung. Deshalb werden die Texte
bei jedem „Willhaben vorbereiten" neu erzeugt. Selbst geschriebener Text bleibt
unangetastet: sobald die Beschreibung im Produktformular manuell bearbeitet wird
(Häkchen „automatisch generieren" aus), gilt sie als `manual` und wird nie
überschrieben.

### Nur deutscher Text

Herstellertexte auf amazon.de sind häufig englisch oder nur teilweise übersetzt.
Solche Bulletpoints und Beschreibungen werden **verworfen**, statt sie in eine
deutsche Anzeige zu kopieren — eine kürzere deutsche Beschreibung ist besser als
eine gemischtsprachige. Die Erkennung zählt Funktionswörter („der/die/das/und/für"
gegen „the/and/for/with") und wertet Umlaute sowie „ß" als eindeutig deutsch; nur
bei klarer englischer Mehrheit wird ein Absatz verworfen.

Hinweis: Titel und Beschreibung entstehen **regelbasiert, nicht per KI** – die
Erweiterung arbeitet rein lokal und schickt keine Produktdaten an einen Dienst.

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
| sichtbare Beschriftung **vor** dem Feld | 8 |
| `data-testid` | 7 |
| `name` | 6 |
| `id`, `placeholder` (auch `data-placeholder`) | 5 |
| umgebender Text | 3 |

Die Beschriftungs-Erkennung ist der wichtigste Teil, weil Willhaben genau so
aufgebaut ist: „Verkaufspreis", „Titel", „Beschreibung" stehen als eigene
Elemente vor dem jeweiligen Feld. Gesucht wird der nächste vorangehende
Geschwisterknoten, der kurzen Text mit mindestens einem echten Wort enthält und
selbst kein Bedienelement umfasst — dadurch werden das „€"-Präfix, die
Formatierungsleiste des Editors und der „zu verschenken"-Schalter übersprungen.

Dazu kommen Ausschluss-Stichwörter (ein Suchfeld „Preis von" wird nie als
Preisfeld gewertet), Element-Art-Prüfungen und eine Mindestpunktzahl. Ein
Bedienelement wird nie zwei Feldern zugeordnet.

Wichtig für die Ausschlusslogik: positive Stichwörter matchen als Teilwort
(deutsche Komposita — „Verkaufspreis" muss „preis" erfüllen), Ausschluss-Wörter
dagegen nur als ganzes Wort und nur in *ausgezeichneter* Evidenz. Sonst würde
der Hilfetext „hilft **Suchenden** deine Anzeige zu finden" neben dem echten
Titelfeld dieses über das Ausschlusswort „suchen" disqualifizieren.

Die Testsuite prüft dieselbe Logik gegen **fünf** unterschiedlich aufgebaute
Formular-Varianten: klassische Labels, nur `aria-label`, Framework-Markup mit
generierten Klassen, unvollständiges Formular — und `marktplatzForm`, das die
Struktur der echten Willhaben-Seite nachbildet.

### Rückfallebene für die Beschreibung

Ein Rich-Text-Editor kann *überhaupt keine* verwertbaren Merkmale tragen: kein
Label, kein aria-Attribut, generierte Wrapper, und die Beschriftung steht nicht
als Geschwisterknoten. Gesucht wird deshalb zusätzlich in **offenen Shadow-Roots**
und **gleichnamigen iframes**, und die Beschriftungssuche überschreitet die
Shadow-Grenze zum Host-Element.

Bleibt das Feld trotzdem unerkannt, greift eine Deduktion statt einer Vermutung:
Ein Anzeigenformular hat genau **einen** mehrzeiligen Editor. Ist die Beschreibung
nicht zugeordnet und bleibt **genau ein** unbenutzter Editor übrig, kann es nur
dieser sein. Bei null oder mehreren freien Editoren wird nichts zugeordnet und
das Feld ehrlich als „nicht gefunden" gemeldet. Suchfelder sind ausgeschlossen.

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

0. **Rich-Text-Beschreibung.** Das Beschreibungsfeld ist ein Editor, kein
   `<textarea>`. Unterstützt werden `contenteditable` (in jeder Ausprägung),
   `role="textbox"`, die Marker von ProseMirror, Quill, Lexical, Slate und
   TinyMCE sowie Editoren in einem **gleichnamigen iframe** (TinyMCE und
   CKEditor classic arbeiten so — dort liegt die Beschriftung im Hauptdokument,
   das Schreibziel im Frame). Geschrieben wird über vier Wege (Editier-Kommando →
   synthetisches Einfügen → InputEvent → direkte Zuweisung), jeder mit Rücklesen
   geprüft. Welchen Editor Willhaben tatsächlich einsetzt, ist von außen nicht
   feststellbar — schlägt es fehl, listet der Assistent automatisch alle
   erkannten Bedienelemente samt Merkmalen auf.

1. **Bild-Upload ist manuell.** Ein `<input type="file">` lässt sich aus
   Sicherheitsgründen nicht programmatisch befüllen. Die Erweiterung bereitet die
   Bild-URLs auf und stellt sie zum Kopieren bereit; die Auswahl der Dateien
   erfolgt im Browser.

2. **Kategorie wird vorgeschlagen, nicht gesetzt.** Willhabens Kategorieauswahl ist
   ein mehrstufiger Dialog. Die Erweiterung mappt die Amazon-Kategorie über
   `categoryMappings.ts` und zeigt den Pfad an; ausgewählt wird er einmal manuell.

3. **Die Amazon-Selektoren wurden nicht gegen die Live-Seite verifiziert.**
   Amazon war in der Entwicklungsumgebung netzwerkseitig nicht erreichbar. Die
   Selektoren zielen auf die langlebigen Element-IDs (`#productTitle`,
   `#landingImage`, `#ASIN`, `#feature-bullets`, …) und liegen ohnehin hinter
   JSON-LD und Meta-Tags als bevorzugten Quellen.

   Das Willhaben-Formular („Marktplatz Anzeige aufgeben – Anzeigendetails") wurde
   inzwischen anhand der echten Seite nachgezogen: Die Beschriftungen stehen dort
   als eigene Elemente **vor** dem Feld (kein `<label for>`), der Preis hat ein
   „€"-Präfix und einen „zu verschenken"-Schalter daneben, die Kategorie wird von
   Willhaben selbst aus dem Titel vorgeschlagen, und die Beschreibung ist ein
   `contenteditable`-Editor mit Formatierungsleiste. `tests/fixtures/willhabenForm.ts`
   enthält diese Struktur als Fixture (`marktplatzForm`), die Erkennung ist dagegen
   getestet.

   Die Einstiegs-URL kann sich ändern — sie ist deshalb in den Einstellungen
   hinterlegt (`willhabenCreateUrl`). Läuft sie ins Leere, erkennt die Erweiterung
   die 404-Seite und sagt konkret, was zu tun ist; navigierst du selbst zum
   Formular, greift die Übernahme trotzdem (auch bei clientseitiger Navigation).

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

191 Tests decken ab: Amazon-Extraktion (inkl. fehlender Felder, defektem JSON-LD,
Suchseiten), ASIN-/Preis-/Bild-Erkennung, Duplikaterkennung, Titel- und
Beschreibungsgenerierung, Kategorie-Mapping, Preis- und Gewinnberechnung
(inkl. Verlusten und Nullwerten), Storage inklusive gleichzeitiger Schreibzugriffe,
Bestand, Mehrfachverkäufe, Willhaben-Feldzuordnung gegen vier Formular-Varianten,
Analytics, CSV-Export, Backup/Restore und den vollständigen Lebenszyklus
Amazon → Willhaben → Verkauf → Dashboard.
