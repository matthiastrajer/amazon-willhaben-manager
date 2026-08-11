import type { Condition } from './Product';

/**
 * Template — reusable defaults for a class of products (fitness, electronics …).
 *
 * A template supplies pricing rules, listing boilerplate and category hints. It
 * never overwrites data the user typed; it only fills gaps and provides the
 * starting point when a product is prepared for a marketplace.
 */
export interface Template {
  id: string;
  name: string;

  /** Optional suffix appended to a generated listing title, e.g. "– Neu". */
  titleSuffix?: string;
  /**
   * Description boilerplate. Supports the placeholders {{title}}, {{brand}},
   * {{features}}, {{condition}}, {{color}}, {{size}}, {{weight}}.
   * When empty, the generated description is used as-is.
   */
  descriptionTemplate?: string;

  condition: Condition;
  /** e.g. "Versand möglich", "Nur Abholung" */
  shipping?: string;
  pickup?: boolean;

  markupPercent?: number;
  markupFixed?: number;
  targetMargin?: number;
  minProfit?: number;

  /** Willhaben category path this template maps to, e.g. ["Sport", "Fitness"]. */
  categoryPath?: string[];

  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}
