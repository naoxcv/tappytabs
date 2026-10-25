type PriceInput = { priceCents?: number; priceVerified?: boolean };

/** Convert an edited menu item into the normalizer's documented price input. */
export function normalizerPrice(item: PriceInput): { price?: string } {
  if (item.priceCents === 0 && item.priceVerified === true) return { price: "$0.00" };
  if (!Number.isFinite(item.priceCents) || (item.priceCents ?? 0) <= 0) return {};
  return { price: `$${(item.priceCents! / 100).toFixed(2)}` };
}

/** Parse a scraped price into cents; ambiguous or missing prices return zero. */
export function scrapedPriceCents(price: unknown): number {
  if (typeof price === "number") return Number.isFinite(price) && price > 0 && price <= 200 ? Math.round(price * 100) : 0;
  if (typeof price !== "string") return 0;
  const source = price.trim();
  if (!source || /^0+(?:[.,]0{1,2})?$/.test(source) || /\b(from|starting|market|varies|ask)\b|[-–]\s*[$€£]?\d/i.test(source)) return 0;
  const value = source.replace(/,/g, ".").match(/\d+(?:\.\d{1,2})?/);
  if (!value) return 0;
  const parsed = Number(value[0]);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 200 ? Math.round(parsed * 100) : 0;
}

/** Preserve the fact that an Actor-provided positive price was only an estimate. */
export function publishedPriceVerified(original: PriceInput | undefined, normalized: PriceInput): boolean {
  return normalized.priceVerified === true && original?.priceVerified !== false;
}
