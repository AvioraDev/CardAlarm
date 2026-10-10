export interface VariantLike {
  price?: string | null;
  available?: boolean;
}

export interface VariantSummary {
  available: boolean;
  price: number;
}

/**
 * A listing is in stock when ANY variant is in stock; its price is the cheapest
 * in-stock variant (or the first variant when none are in stock).
 */
export function summarizeVariants(variants: VariantLike[] | null | undefined): VariantSummary {
  const list = Array.isArray(variants) ? variants : [];
  const parsePrice = (variant: VariantLike | undefined): number => {
    const price = parseFloat(variant?.price ?? '0');
    return Number.isFinite(price) ? price : 0;
  };

  const inStock = list.filter(variant => variant?.available === true);
  if (inStock.length === 0) return { available: false, price: parsePrice(list[0]) };

  const cheapest = inStock.reduce((best, variant) => (parsePrice(variant) < parsePrice(best) ? variant : best));
  return { available: true, price: parsePrice(cheapest) };
}
