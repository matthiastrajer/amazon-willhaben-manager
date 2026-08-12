import { CONDITION_LABELS, type Product } from '@/core/models/Product';
import type { Settings } from '@/core/models/Settings';
import { mapCategory } from '@/core/services/categoryMappings';
import type { MappedValue } from './formFiller';
import type { PlatformFormConfig } from './fieldProfiles';

/**
 * Formats a price for a listing form.
 *
 * A whole amount is written without decimals: marketplace price inputs filter
 * the input themselves, and feeding Willhaben "79,00" left "79" behind while the
 * field still counted as unfilled. Sending "79" avoids that entirely.
 */
export function formatPriceForForm(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace('.', ',');
}

/**
 * Turns a product into concrete values for one marketplace, without touching the
 * DOM — pure and unit-testable.
 *
 * Only fields the platform actually declares are produced, and when the user
 * restricts the transfer to the essentials, only the platform's essential fields
 * are returned (plus the images, which are the one manual step the prepared
 * values are still needed for).
 */
export function buildListingValues(
  config: PlatformFormConfig,
  product: Product,
  settings: Settings,
): MappedValue[] {
  const has = (id: MappedValue['field']) => config.fields.some((f) => f.id === id);
  const values: MappedValue[] = [];

  const price = product.plannedSalePrice;
  if (has('price') && price !== undefined && price !== null && price > 0) {
    values.push({
      field: 'price',
      label: config.fields.find((f) => f.id === 'price')!.label,
      value: formatPriceForForm(price),
    });
  }

  const title = product.listingTitle?.trim() || product.title;
  if (has('title') && title) values.push({ field: 'title', label: 'Titel', value: title });

  const description = product.listingDescription?.trim() || product.description;
  if (has('description') && description) {
    values.push({ field: 'description', label: 'Beschreibung', value: description });
  }

  const images = product.selectedImages.length ? product.selectedImages : product.images;
  const imageValue: MappedValue | null =
    has('images') && images.length
      ? {
          field: 'images',
          label: 'Bilder',
          value: images.slice(0, settings.maxImages).join('\n'),
          note: `${Math.min(images.length, settings.maxImages)} Bild(er) vorbereitet.`,
        }
      : null;

  if (settings.onlyCoreFields) {
    const essentials = new Set(config.essentialFields);
    const restricted = values.filter((v) => essentials.has(v.field));
    if (imageValue) restricted.push(imageValue);
    return restricted;
  }

  if (has('quantity')) {
    const available = Math.max(1, (product.quantity || 1) - (product.soldQuantity || 0));
    values.push({ field: 'quantity', label: 'Menge', value: String(available) });
  }

  if (has('category')) {
    const category = mapCategory({
      categoryPath: product.category ? [product.category, product.subcategory ?? ''] : [],
      category: product.category,
      title: product.title,
      bulletPoints: product.bulletPoints,
    });
    values.push({
      field: 'category',
      label: 'Kategorie',
      value: category.path.join(' → '),
      note:
        category.mappingId === null
          ? 'Keine eindeutige Zuordnung gefunden – bitte Kategorie selbst wählen.'
          : `Vorschlag basierend auf der Amazon-Kategorie (${category.confidence}).`,
    });
  }

  const condition = CONDITION_LABELS[product.condition];
  if (has('condition') && condition) {
    values.push({ field: 'condition', label: 'Zustand', value: condition });
  }

  if (has('brand') && product.brand) {
    values.push({ field: 'brand', label: 'Marke', value: product.brand });
  }
  if (has('color') && product.color) {
    values.push({ field: 'color', label: 'Farbe', value: product.color });
  }
  if (has('size') && product.size) {
    values.push({ field: 'size', label: 'Größe', value: product.size });
  }

  if (has('postalCode') && settings.defaultPostalCode) {
    values.push({ field: 'postalCode', label: 'PLZ', value: settings.defaultPostalCode });
  }
  if (has('location') && settings.defaultLocation) {
    values.push({ field: 'location', label: 'Ort', value: settings.defaultLocation });
  }
  if (has('shipping') && settings.defaultShipping) {
    values.push({ field: 'shipping', label: 'Versand', value: settings.defaultShipping });
  }
  if (has('pickup') && settings.defaultPickup) {
    values.push({ field: 'pickup', label: 'Abholung', value: 'Ja' });
  }

  if (imageValue) values.push(imageValue);
  return values;
}
