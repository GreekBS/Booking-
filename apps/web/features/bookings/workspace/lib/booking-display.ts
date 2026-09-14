import type { QuoteRecord } from "@/lib/admin/types";

export function formatBookingDisplayId(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

export function computeQuoteDiscountTotal(quote: QuoteRecord | null): number | null {
  if (!quote) return null;
  let discount = 0;
  for (const line of quote.lineItems) {
    const base = Number.parseFloat(line.baseAmount);
    const adjusted = Number.parseFloat(line.adjustedAmount);
    if (base > adjusted) discount += base - adjusted;
  }
  return discount > 0 ? discount : null;
}
