type PriceInput = { priceCents?: number; priceVerified?: boolean };
type RawItem = { name: string; price?: string | number; [key: string]: unknown };
type NormalizedPrice = { name: string; menuOrder?: number; priceCents?: number; priceVerified?: boolean };

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

/** Attach only matching, positive, unverified Actor estimates to raw menu items. */
export function withEstimatedPrices(rawItems: RawItem[], normalizedItems: NormalizedPrice[]): RawItem[] {
  const estimates = new Map(
    normalizedItems
      .filter((item) => item.priceVerified === false && Number.isInteger(item.priceCents) && item.priceCents! > 0 && item.priceCents! <= 20_000)
      .map((item) => [item.name.trim().toLowerCase(), item.priceCents!] as const),
  );
  return rawItems.map((item) => {
    if (scrapedPriceCents(item.price) > 0) return item;
    const estimate = estimates.get(item.name.trim().toLowerCase());
    return estimate === undefined ? item : { ...item, estimatedPriceCents: estimate };
  });
}
