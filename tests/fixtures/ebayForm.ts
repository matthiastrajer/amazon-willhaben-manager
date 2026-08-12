/**
 * Mock eBay "Angebot erstellen" forms.
 *
 * These reproduce the German wording eBay uses and the markup styles a large
 * commerce app plausibly produces — they are NOT a copy of the live page, which
 * could not be reached from the development environment. Their purpose is to pin
 * the *discovery strategy*: the field profiles carry no CSS selectors, so the
 * variants below express the same form through different markup and the mapper
 * has to cope with all of them.
 */

/** Classic markup with real <label for> elements. */
export function ebayLabelledForm(): string {
  return `<!doctype html>
<html lang="de"><body>
  <main>
    <h1>Angebot erstellen</h1>
    <form>
      <div><label for="title">Titel</label>
        <input id="title" name="title" type="text" maxlength="80"></div>

      <div><label for="subtitle">Untertitel (gebührenpflichtig)</label>
        <input id="subtitle" name="subtitle" type="text"></div>

      <div><label for="cond">Artikelzustand</label>
        <select id="cond" name="conditionId">
          <option value="">Bitte auswählen</option>
          <option value="1000">Neu</option>
          <option value="1500">Neu: Sonstige</option>
          <option value="3000">Gebraucht</option>
        </select></div>

      <div><label for="desc">Artikelbeschreibung</label>
        <textarea id="desc" name="description" rows="10"></textarea></div>

      <div><label for="price">Sofort-Kaufen-Preis</label>
        <input id="price" name="binPrice" type="text" inputmode="decimal"></div>

      <div><label for="qty">Menge</label>
        <input id="qty" name="quantity" type="number" min="1"></div>

      <div><label for="brand">Marke</label>
        <input id="brand" name="brand" type="text"></div>

      <div><label for="colour">Farbe</label>
        <input id="colour" name="color" type="text"></div>

      <div><label for="zip">Artikelstandort (PLZ)</label>
        <input id="zip" name="postalCode" type="text" maxlength="5"></div>

      <div><label for="city">Ort</label>
        <input id="city" name="city" type="text"></div>

      <div><label for="cat">Kategorie</label>
        <select id="cat" name="categoryId"><option value="">Kategorie wählen</option></select></div>

      <div><label for="pics">Fotos hinzufügen</label>
        <input id="pics" name="pictures" type="file" multiple></div>

      <button type="submit">Angebot einstellen</button>
    </form>
  </main>
</body></html>`;
}

/**
 * Framework-rendered variant: generated class names, captions as elements before
 * the field, a contenteditable description editor and data-testid hooks.
 */
export function ebayModernForm(): string {
  return `<!doctype html>
<html lang="de"><body>
  <div id="app">
    <h1>Angebotsdetails</h1>
    <div class="se-field-group">
      <div class="se-fx"><span class="se-lbl">Titel</span>
        <input class="se-in" data-testid="listing-title-input" type="text"></div>

      <div class="se-fx"><span class="se-lbl">Artikelzustand</span>
        <select class="se-sel" data-testid="condition-select">
          <option value="">Auswählen</option>
          <option value="new">Neu</option>
          <option value="used">Gebraucht</option>
        </select></div>

      <div class="se-fx"><span class="se-lbl">Sofort-Kaufen-Preis</span>
        <div class="se-money"><span>EUR</span>
          <input class="se-in" data-testid="bin-price-input" type="text"></div></div>

      <div class="se-fx"><span class="se-lbl">Menge</span>
        <input class="se-in" data-testid="quantity-input" type="number"></div>

      <div class="se-fx"><span class="se-lbl">Artikelbeschreibung</span>
        <div class="se-editor">
          <div class="se-toolbar">
            <button type="button" aria-label="Fett">B</button>
            <button type="button" aria-label="Kursiv">I</button>
          </div>
          <div class="se-body" contenteditable="true" role="textbox"
               data-placeholder="Beschreibe deinen Artikel möglichst genau."></div>
        </div></div>

      <div class="se-fx"><span class="se-lbl">Artikelstandort</span>
        <input class="se-in" data-testid="postal-code-input" type="text"></div>
    </div>
  </div>
</body></html>`;
}

/** Search / browse page — must never be treated as the listing form. */
export function ebayBrowsePage(): string {
  return `<!doctype html>
<html lang="de"><body>
  <h1>Hantelbank günstig kaufen</h1>
  <form role="search">
    <label for="q">Suchbegriff</label>
    <input id="q" name="_nkw" type="search" placeholder="Wonach suchen Sie?">
    <label for="pf">Preis von</label><input id="pf" name="_udlo" type="number">
    <label for="pt">Preis bis</label><input id="pt" name="_udhi" type="number">
  </form>
</body></html>`;
}

export const EBAY_CREATE_URL = 'https://www.ebay.at/sl/sell';
export const EBAY_ITEM_URL = 'https://www.ebay.at/itm/yoleo-klappbare-hantelbank/285123456789';
