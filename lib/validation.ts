import { z } from "zod";
import { AMENITIES } from "./types";
import { PILOT_LIMITS } from "./pilot-limits";
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
export const listingInput = z.object({
  title: text(8, 100), city: text(2, 80), neighborhood: text(2, 100), address: text(8, 240), lat: z.number().finite().min(4.5).max(21.5), lng: z.number().finite().min(116).max(127),
  type: z.enum(["Apartment", "Condo", "House", "Room", "Bedspace"]), price: z.number().int().min(100).max(1000000), priceBasis: z.enum(["per person", "per room", "entire unit"]), bedrooms: z.number().int().min(0).max(20), bathrooms: z.number().int().min(0).max(20), area: z.number().min(1).max(10000), description: text(30, 5000), photos: z.array(z.string().regex(/^\/api\/media\/[a-f0-9-]{36}$/)).min(1).max(PILOT_LIMITS.photosPerProperty).refine(photos => new Set(photos).size === photos.length, "Use different photos for each image."), amenities: z.array(z.string().refine(a => AMENITIES.includes(a))).max(10),
  deposit: z.number().int().min(0).max(3000000), advance: z.number().int().min(0).max(3000000), monthlyFees: z.number().int().min(0).max(100000), utilities: text(5, 500), minLease: z.number().int().min(1).max(60), availableFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => !Number.isNaN(Date.parse(s))), role: z.enum(["Direct owner", "Authorized manager", "Licensed broker"]), exactLocation: z.boolean(), authorityConfirmed: z.literal(true),
});
export const inquiryInput = z.object({ listingId: text(1, 80), message: text(10, 2000), moveIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => !Number.isNaN(Date.parse(s))), occupants: z.number().int().min(1).max(20) });
export const actionInput = z.object({ action: z.enum(["approve", "reject", "update", "confirm", "pause", "rent", "resubmit", "withdraw"]), reason: z.string().trim().max(500).optional(), data: z.unknown().optional() });
export const replyInput = z.object({ id: text(1, 80), reply: text(5, 2000) });
export const savedInput = z.object({ listingId: text(1, 80), saved: z.boolean() });
export const reportInput = z.object({ listingId: text(1, 80), reason: text(10, 1000) });
export const resolveReportInput = z.object({ id: text(1, 80) });
