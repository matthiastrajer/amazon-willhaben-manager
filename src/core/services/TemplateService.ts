import type { Template } from '@/core/models/Template';
import { STORAGE_KEYS } from '@/shared/constants';
import { createId } from '@/core/utils/id';
import { StorageService } from './StorageService';
import { notifyDataChanged } from '@/shared/messages';
import { mapCategory } from './categoryMappings';

/**
 * Starter templates. These are real, usable defaults — not demo data: they only
 * contain pricing rules and boilerplate, no fabricated product information.
 * They are seeded once on first run and can be edited or deleted.
 */
function seedTemplates(): Template[] {
  const now = new Date().toISOString();
  const base = { createdAt: now, updatedAt: now };
  return [
    {
      id: createId('tpl'),
      name: 'Standard Neuware',
      condition: 'NEU',
      titleSuffix: '',
      shipping: 'Versand möglich',
      pickup: true,
      markupPercent: 30,
      minProfit: 5,
      isDefault: true,
      ...base,
    },
    {
      id: createId('tpl'),
      name: 'Standard Fitness',
      condition: 'NEU',
      shipping: 'Versand möglich',
      pickup: true,
      markupPercent: 50,
      minProfit: 5,
      categoryPath: ['Sport & Freizeit', 'Fitness'],
      isDefault: false,
      ...base,
    },
    {
      id: createId('tpl'),
      name: 'Standard Elektronik',
      condition: 'NEU',
      shipping: 'Versand möglich',
      pickup: true,
      markupPercent: 25,
      minProfit: 10,
      categoryPath: ['Elektronik', 'Computer & Zubehör'],
      isDefault: false,
      ...base,
    },
    {
      id: createId('tpl'),
      name: 'Standard Haushalt',
      condition: 'NEU',
      shipping: 'Nur Abholung',
      pickup: true,
      markupPercent: 35,
      minProfit: 5,
      categoryPath: ['Haushalt', 'Küche'],
      isDefault: false,
      ...base,
    },
  ];
}

export const TemplateService = {
  async all(): Promise<Template[]> {
    return StorageService.get<Template[]>(STORAGE_KEYS.templates, []);
  },

  /** Seeds the starter templates exactly once (first run / after a reset). */
  async ensureSeeded(): Promise<Template[]> {
    return StorageService.mutate<Template[]>(STORAGE_KEYS.templates, [], (list) =>
      list.length ? list : seedTemplates(),
    );
  },

  async byId(id: string | undefined): Promise<Template | undefined> {
    if (!id) return undefined;
    return (await TemplateService.all()).find((t) => t.id === id);
  },

  async getDefault(): Promise<Template | undefined> {
    const list = await TemplateService.all();
    return list.find((t) => t.isDefault) ?? list[0];
  },

  /**
   * Picks the template that best fits a product by comparing the product's
   * mapped Willhaben category with each template's category path.
   */
  async suggestFor(input: {
    category?: string;
    categoryPath?: string[];
    title?: string;
    bulletPoints?: string[];
  }): Promise<Template | undefined> {
    const templates = await TemplateService.all();
    if (!templates.length) return undefined;
    const match = mapCategory(input);

    const scored = templates
      .map((t) => {
        if (!t.categoryPath?.length) return { t, score: 0 };
        let score = 0;
        if (t.categoryPath[0] === match.path[0]) score += 2;
        if (t.categoryPath[1] && t.categoryPath[1] === match.path[1]) score += 3;
        return { t, score };
      })
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (best && best.score > 0) return best.t;
    return templates.find((t) => t.isDefault) ?? templates[0];
  },

  async create(input: Partial<Template> & { name: string }): Promise<Template> {
    const now = new Date().toISOString();
    const template: Template = {
      id: createId('tpl'),
      name: input.name,
      titleSuffix: input.titleSuffix,
      descriptionTemplate: input.descriptionTemplate,
      condition: input.condition ?? 'NEU',
      shipping: input.shipping,
      pickup: input.pickup ?? true,
      markupPercent: input.markupPercent,
      markupFixed: input.markupFixed,
      targetMargin: input.targetMargin,
      minProfit: input.minProfit,
      categoryPath: input.categoryPath,
      isDefault: input.isDefault ?? false,
      createdAt: now,
      updatedAt: now,
    };
    await StorageService.mutate<Template[]>(STORAGE_KEYS.templates, [], (list) =>
      template.isDefault
        ? [...list.map((t) => ({ ...t, isDefault: false })), template]
        : [...list, template],
    );
    notifyDataChanged(['templates']);
    return template;
  },

  async update(id: string, patch: Partial<Template>): Promise<Template | undefined> {
    let updated: Template | undefined;
    await StorageService.mutate<Template[]>(STORAGE_KEYS.templates, [], (list) => {
      const next = list.map((t) => {
        if (t.id !== id) return patch.isDefault ? { ...t, isDefault: false } : t;
        updated = { ...t, ...patch, id: t.id, updatedAt: new Date().toISOString() };
        return updated;
      });
      return next;
    });
    if (updated) notifyDataChanged(['templates']);
    return updated;
  },

  async remove(id: string): Promise<void> {
    await StorageService.mutate<Template[]>(STORAGE_KEYS.templates, [], (list) =>
      list.filter((t) => t.id !== id),
    );
    notifyDataChanged(['templates']);
  },

  async replaceAll(templates: Template[]): Promise<void> {
    await StorageService.set(STORAGE_KEYS.templates, templates);
    notifyDataChanged(['templates']);
  },
};
