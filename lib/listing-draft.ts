export const LISTING_NUMBER_FIELDS = ["price", "bedrooms", "bathrooms", "area", "deposit", "advance", "monthlyFees", "minLease"] as const;
export type ListingNumberField = typeof LISTING_NUMBER_FIELDS[number];
export type ListingNumberDraft = Record<ListingNumberField, string>;

export const LISTING_NUMBER_RULES = {
  price: { min: 100, max: 1000000, step: "1", optional: false },
  bedrooms: { min: 0, max: 20, step: "1", optional: false },
  bathrooms: { min: 0, max: 20, step: "1", optional: false },
  area: { min: 1, max: 10000, step: "any", optional: false },
  deposit: { min: 0, max: 3000000, step: "1", optional: true },
  advance: { min: 0, max: 3000000, step: "1", optional: true },
  monthlyFees: { min: 0, max: 100000, step: "1", optional: true },
  minLease: { min: 1, max: 60, step: "1", optional: false },
} as const;

export function initialListingNumbers(initial?: Partial<Record<ListingNumberField, number>>): ListingNumberDraft {
  const values: ListingNumberDraft = { price: "", bedrooms: "1", bathrooms: "1", area: "", deposit: "", advance: "", monthlyFees: "", minLease: "6" };
  for (const key of LISTING_NUMBER_FIELDS) if (initial?.[key] !== undefined) values[key] = String(initial[key]);
  return values;
}

export function normalizeNumberText(value: string): string {
  return value.replace(/^0+(?=\d)/, "");
}

export function listingNumbers(draft: ListingNumberDraft): Record<ListingNumberField, number> {
  return Object.fromEntries(LISTING_NUMBER_FIELDS.map(key => [key, draft[key].trim() ? Number(draft[key]) : LISTING_NUMBER_RULES[key].optional ? 0 : Number.NaN])) as Record<ListingNumberField, number>;
}
