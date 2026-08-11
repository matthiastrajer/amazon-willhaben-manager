/**
 * Mock Willhaben ad-creation forms.
 *
 * These fixtures exist to prove the *discovery strategy*, not a specific
 * markup: the extension deliberately does not depend on Willhaben's generated
 * CSS classes (see willhabenSelectors.ts). Each variant below expresses the
 * same form through a different, equally plausible markup style, and the field
 * mapper has to cope with all of them:
 *
 *   labelled    – classic <label for> markup
 *   aria        – no labels at all, only aria-label
 *   framework   – generated class names, captions as sibling divs, data-testid
 *   partial     – several fields simply missing
 */

/** Classic form with real <label for="…"> elements. */
export function labelledForm(): string {
  return `<!doctype html>
<html lang="de"><body>
  <main>
    <h1>Anzeige aufgeben</h1>
    <form>
      <div><label for="ad-title">Titel</label>
        <input id="ad-title" name="title" type="text" maxlength="80"></div>

      <div><label for="ad-desc">Beschreibung</label>
        <textarea id="ad-desc" name="description" rows="8"></textarea></div>

      <div><label for="ad-price">Preis (€)</label>
        <input id="ad-price" name="price" type="text" inputmode="decimal"></div>

      <div><label for="ad-brand">Marke</label>
        <input id="ad-brand" name="brand" type="text"></div>

      <div><label for="ad-color">Farbe</label>
        <input id="ad-color" name="color" type="text"></div>

      <div><label for="ad-size">Größe</label>
        <input id="ad-size" name="size" type="text"></div>

      <div><label for="ad-condition">Zustand</label>
        <select id="ad-condition" name="condition">
          <option value="">Bitte wählen</option>
          <option value="new">Neu</option>
          <option value="used-like-new">Neuwertig</option>
          <option value="used">Gebraucht</option>
        </select></div>

      <div><label for="ad-plz">Postleitzahl</label>
        <input id="ad-plz" name="postalCode" type="text" maxlength="4"></div>

      <div><label for="ad-city">Ort</label>
        <input id="ad-city" name="location" type="text"></div>

      <div><label for="ad-shipping">Versand möglich</label>
        <input id="ad-shipping" name="shipping" type="checkbox"></div>

      <div><label for="ad-pickup">Abholung möglich</label>
        <input id="ad-pickup" name="pickup" type="checkbox"></div>

      <div><label for="ad-images">Bilder hochladen</label>
        <input id="ad-images" name="images" type="file" multiple></div>

      <button type="submit">Anzeige veröffentlichen</button>
    </form>
  </main>
</body></html>`;
}

/** Label-free form that relies entirely on aria-label / placeholder. */
export function ariaForm(): string {
  return `<!doctype html>
<html lang="de"><body>
  <main>
    <h1>Neue Anzeige</h1>
    <div>
      <input type="text" aria-label="Anzeigentitel" placeholder="Was möchtest du verkaufen?">
      <textarea aria-label="Beschreibung deiner Anzeige" placeholder="Beschreibe deinen Artikel"></textarea>
      <input type="number" aria-label="Preis in Euro" placeholder="0,00">
      <input type="text" aria-label="Marke des Artikels">
      <input type="text" aria-label="PLZ">
      <input type="text" aria-label="Ort">
      <input type="file" aria-label="Fotos hinzufügen">
    </div>
  </main>
</body></html>`;
}

/**
 * Framework-rendered form: generated class names, captions as sibling text and
 * data-testid hooks — the shape a modern SPA typically produces.
 */
export function frameworkForm(): string {
  return `<!doctype html>
<html lang="de"><body>
  <div id="__next">
    <h1>Anzeige erstellen</h1>
    <div class="sc-kAyceB fXlPCk">
      <div class="sc-bczRLJ hTaEUt"><span class="sc-gsnTZi kAqTQb">Titel</span>
        <input class="sc-dkPtRN gVzMHB" data-testid="ad-insertion-title-field" type="text"></div>

      <div class="sc-bczRLJ hTaEUt"><span class="sc-gsnTZi kAqTQb">Beschreibung</span>
        <textarea class="sc-dkPtRN kOfLdV" data-testid="ad-insertion-description-field"></textarea></div>

      <div class="sc-bczRLJ hTaEUt"><span class="sc-gsnTZi kAqTQb">Preis</span>
        <input class="sc-dkPtRN gVzMHB" data-testid="ad-insertion-price-field" type="text"></div>

      <div class="sc-bczRLJ hTaEUt"><span class="sc-gsnTZi kAqTQb">Standort</span>
        <input class="sc-dkPtRN gVzMHB" data-testid="ad-insertion-location-field" type="text"></div>

      <div class="sc-bczRLJ hTaEUt"><span class="sc-gsnTZi kAqTQb">Kategorie</span>
        <select class="sc-dkPtRN eJHkQl" data-testid="ad-insertion-category-select">
          <option value="">Kategorie wählen</option>
          <option value="sport">Sport &amp; Freizeit</option>
        </select></div>
    </div>
  </div>
</body></html>`;
}

/** Only a title field — everything else must be reported as not found. */
export function partialForm(): string {
  return `<!doctype html>
<html lang="de"><body>
  <h1>Anzeige aufgeben</h1>
  <form>
    <label for="t">Titel</label>
    <input id="t" name="title" type="text">
  </form>
</body></html>`;
}

/**
 * Reproduces the structure of the real "Marktplatz Anzeige aufgeben –
 * Anzeigendetails" form as observed in the browser:
 *
 *  - captions are plain elements rendered BEFORE the field, not <label for>
 *  - the price input sits next to a "€" prefix and a "zu verschenken" toggle
 *  - the category is auto-suggested from the title, there is no category control
 *  - the description is a rich-text editor (contenteditable + toolbar buttons)
 *  - image upload is drag & drop with a hidden file input
 */
export function marktplatzForm(): string {
  return `<!doctype html>
<html lang="de"><body>
  <div id="__next">
    <h1>Marktplatz Anzeige aufgeben - Anzeigendetails</h1>
    <form>
      <div class="sc-a">
        <div class="sc-b">
          <span class="sc-c">Bilder per Drag &amp; Drop hinzufügen, oder</span>
          <button type="button">Dateien durchsuchen</button>
          <input type="file" accept="image/*" multiple hidden>
        </div>
        <p>Bilder unterstützen deine Interessent:innen dabei, sich dein Produkt besser vorstellen zu können.</p>
      </div>

      <div class="sc-d">
        <span class="sc-e">Verkaufspreis</span>
        <div class="sc-f">
          <div class="sc-g"><span>€</span><input class="sc-h" type="text" inputmode="decimal"></div>
          <div class="sc-i"><input type="checkbox" id="giveaway"><label for="giveaway">zu verschenken</label></div>
        </div>
      </div>

      <div class="sc-j">
        <span class="sc-e">Titel</span>
        <input class="sc-k" type="text" placeholder="z.B. Levi's 501 Jeans, schwarz, Größe 32">
        <p>Ein aussagekräftiger Titel hilft Suchenden deine Anzeige schneller zu finden.</p>
      </div>

      <div class="sc-l">
        <span class="sc-e">Kategorie</span>
        <p>Kategorien werden passend zu deinem Anzeigentitel vorgeschlagen.</p>
        <a href="#">Andere Kategorie wählen</a>
      </div>

      <div class="sc-m">
        <span class="sc-e">Beschreibung</span>
        <div class="sc-n">
          <div class="sc-toolbar">
            <button type="button" aria-label="Fett">B</button>
            <button type="button" aria-label="Kursiv">I</button>
            <button type="button" aria-label="Liste">•</button>
            <button type="button" aria-label="Nummerierte Liste">1.</button>
          </div>
          <div class="sc-o" contenteditable="true" role="textbox"
               data-placeholder="z.B. Abmessungen, Größe, Gründe für den Verkauf, Mängel/Defekte falls vorhanden."></div>
        </div>
      </div>
    </form>
  </div>
</body></html>`;
}

/** A page that is clearly not the ad-creation flow. */
export function unrelatedPage(): string {
  return `<!doctype html>
<html lang="de"><body>
  <h1>Willkommen bei willhaben</h1>
  <form role="search">
    <label for="q">Suchbegriff</label>
    <input id="q" name="keyword" type="search" placeholder="Wonach suchst du?">
    <label for="pf">Preis von</label><input id="pf" name="priceFrom" type="number">
    <label for="pt">Preis bis</label><input id="pt" name="priceTo" type="number">
  </form>
</body></html>`;
}

/** A published ad detail page, used for listing-URL capture. */
export const AD_DETAIL_URL =
  'https://www.willhaben.at/iad/kaufen-und-verkaufen/d/fitgriff-zughilfen-lifting-straps-1234567890/';

export const CREATE_FORM_URL =
  'https://www.willhaben.at/iad/anzeigenaufgabe/marktplatz?adTypeId=67&productId=67';

/** The chooser step that precedes the actual form. */
export const CREATE_CHOOSER_URL = 'https://www.willhaben.at/iad/anzeigenaufgabe';

/** The obsolete path that returns a 404 page. */
export function notFoundPage(): string {
  return `<!doctype html>
<html lang="de"><head><title>Die Seite wurde nicht gefunden</title></head><body>
  <h1>Die Seite wurde nicht gefunden</h1>
  <p>Die Seite wurde entfernt oder die URL wurde erneuert.</p>
  <a href="/">Bring mich zur Startseite!</a>
</body></html>`;
}
