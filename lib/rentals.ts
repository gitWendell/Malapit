import { z } from "zod";

export const RENTAL_LIMITS = { units: 100, unitsPerOwner: 30, dailyInvitations: 30, invitationDays: 7 } as const;
export const normalizeRentalEmail = (email: string) => email.trim().toLowerCase();
export function isCivilDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number(value.slice(0, 4)) >= 1900 && Number(value.slice(0, 4)) <= 2200 && !Number.isNaN(Date.parse(value + "T12:00:00Z")) && new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value;
}
export function philippinesDay(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)!.value).join("-");
}
export function pesoInputToCents(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}
export const rentalMoney = (cents: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(cents / 100);
export const rentalDate = (value: string) => new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }).format(new Date(value.length === 10 ? value + "T12:00:00+08:00" : value));
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const civil = z.string().refine(isCivilDate, "Enter a valid date.");
export const rentalUnitInput = z.object({
  propertyName: text(2, 100), unitName: text(1, 60), city: text(2, 80), address: text(8, 250),
  monthlyRentCents: z.number().int().min(10000, "Monthly rent must be at least ₱100.").max(100000000, "Monthly rent must be at most ₱1,000,000."),
  dueDay: z.number().int().min(1).max(31), leaseStart: civil, leaseEnd: civil.nullable(),
}).refine(data => !data.leaseEnd || data.leaseEnd >= data.leaseStart, { path: ["leaseEnd"], message: "The end date must be on or after the start date." });
export const rentalUnitAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update"), version: text(1, 40), data: rentalUnitInput }),
  z.object({ action: z.enum(["archive", "restore"]), version: text(1, 40) }),
]);
export const rentalInviteInput = z.object({ unitId: z.string().uuid(), unitVersion: text(1, 40), email: z.string().trim().email().max(254).transform(normalizeRentalEmail), sharingConfirmed: z.literal(true) });
export const rentalCreateRequest = z.object({ requestId: z.string().uuid().optional() });
export const rentalConnectionAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept"), detailsConfirmed: z.literal(true), firstBillConfirmed: z.boolean().default(false) }),
  z.object({ action: z.enum(["decline", "revoke", "end"]), confirmed: z.literal(true) }),
]);

export type RentalStatus = "pending" | "accepted" | "declined" | "revoked" | "expired" | "ended";
export type RentalUnit = z.infer<typeof rentalUnitInput> & { id: string; ownerId: string; createdAt: string; updatedAt: string; archivedAt: string | null };
export type RentalConnection = z.infer<typeof rentalUnitInput> & {
  latestBillId?: string | null; id: string; unitId: string; ownerId: string; ownerName: string; ownerEmail: string; inviteEmail: string;
  renterId: string | null; renterName: string | null; renterEmail: string | null; status: RentalStatus;
  createdAt: string; expiresAt: string; respondedAt: string | null; endedAt: string | null; endedBy: string | null;
};
export type RentalEvent = { id: string; connectionId: string; actorId: string; actorName: string; action: string; createdAt: string };
export type RentalsData = { units: RentalUnit[]; ownedConnections: RentalConnection[]; myConnections: RentalConnection[]; limits: typeof RENTAL_LIMITS };
export function effectiveRentalStatus(connection: Pick<RentalConnection, "status" | "expiresAt">, now = new Date().toISOString()): RentalStatus {
  return connection.status === "pending" && connection.expiresAt <= now ? "expired" : connection.status;
}
export const rentalStatusLabel = (status: RentalStatus) => ({ pending: "Invitation pending", accepted: "Connected", declined: "Declined", revoked: "Revoked", expired: "Expired", ended: "Connection closed" }[status]);
