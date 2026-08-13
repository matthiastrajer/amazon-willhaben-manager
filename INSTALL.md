# Installation auf einem beliebigen PC

Die fertig gebaute Erweiterung liegt im Ordner **`dist/`** und ist im Repository
enthalten. Auf dem Zielrechner werden **weder Node.js noch Git noch ein Build**
benötigt — nur Chrome.

---

## In 5 Schritten

**1. Herunterladen**

Auf der GitHub-Seite des Repositorys:

- Oben den Branch **`claude/amazon-willhaben-extension-p0vatw`** auswählen
- Grüner Knopf **„Code"** → **„Download ZIP"**

**2. Entpacken**

Die ZIP an einen **festen Ort** entpacken, den du nicht mehr verschiebst, z. B.

```
C:\Users\<Name>\Documents\willhaben-extension\
```

> Nicht im Downloads-Ordner lassen — Chrome lädt die Erweiterung bei jedem Start
> aus diesem Pfad. Wird er gelöscht oder verschoben, verschwindet die Erweiterung.

**3. Erweiterungsseite öffnen**

In die Chrome-Adresszeile eingeben:

```
chrome://extensions
```

**4. Entwicklermodus einschalten**

Schalter oben rechts.

**5. Laden**

**„Entpackte Erweiterung laden"** klicken und den Ordner **`dist`** auswählen —
also `…\willhaben-extension\amazon-willhaben-manager-…\dist`.

Wichtig: **nicht** den äußeren Projektordner auswählen, sondern `dist` selbst.
Darin muss eine `manifest.json` liegen.

Fertig. Das violette Pfeil-Symbol erscheint in der Chrome-Leiste; über das
Puzzle-Symbol lässt es sich anpinnen.

---

## Daten vom anderen PC mitnehmen

Produkte, Verkäufe und Einstellungen liegen im **Browserprofil**, nicht im
`dist`-Ordner — sie kommen also nicht automatisch mit.

| Alter PC | Neuer PC |
| --- | --- |
| Dashboard → ⚙ Einstellungen → **„Backup erstellen (JSON)"** | Dashboard → ⚙ Einstellungen → **„Backup importieren (ersetzen)"** |

Die JSON-Datei enthält Produkte, Verkäufe, Anzeigen, Vorlagen und Einstellungen.

---

## Erste Einstellungen

Dashboard → ⚙ Einstellungen:

- **Standard-PLZ** und **Standard-Ort** eintragen (werden sonst nicht ins
  Formular übernommen)
- **Standard-Aufschlag %** und **Mindestgewinn** prüfen
- Bei Bedarf **eBay-Startseite** auf `ebay.de` umstellen (Standard ist `ebay.at`)

---

## Aktualisieren

Neue ZIP herunterladen, entpacken, den alten `dist`-Ordner ersetzen, dann in
`chrome://extensions` bei der Erweiterung auf **🔄** klicken.

Die gespeicherten Daten bleiben dabei erhalten.

---

## Hinweise

**Chrome zeigt bei jedem Start eine Warnung** („Erweiterungen im Entwicklermodus
deaktivieren"). Das betrifft alle selbst geladenen Erweiterungen und lässt sich
wegklicken.

**Für viele Rechner** lohnt der Chrome Web Store mit Sichtbarkeit „nicht
gelistet": Installation per Link, automatische Updates, keine Warnung. Kostet
einmalig 5 $ Entwicklergebühr und durchläuft eine Prüfung. Die passende ZIP
erzeugt `npm run zip`.
