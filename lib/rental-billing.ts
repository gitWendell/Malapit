import { z } from "zod";
import { billDefaults, isBillingMonth, monthBounds } from "./rental-bills.ts";
import { philippinesDay, type RentalConnection } from "./rentals.ts";

export type BillSchedule = {
  connectionId: string; ownerId: string; status: "enabled" | "paused" | "attention" | "finished";
  firstMonth: string; nextMonth: string; issue: string; version: number; createdAt: string; updatedAt: string; updatedBy: string;
  lastCheckedAt: string | null; lastBillId: string | null;
};
export type BillingPreview = { month: string; periodStart: string; periodEnd: string; dueDate: string; amountCents: number };
export type RentalBilling = { schedule: BillSchedule | null; preview: BillingPreview | null };
export const billScheduleAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("enable"), version: z.number().int().positive().nullable(), month: z.string().refine(isBillingMonth), detailsConfirmed: z.literal(true) }),
  z.object({ action: z.literal("pause"), version: z.number().int().positive(), confirmed: z.literal(true) }),
]);
export const scheduleIssueLabel = (issue: string) => ({
  partial: "This month covers only part of the rental. Create its agreed bill manually.",
  missed: "A billing month was missed. Review the bills before turning the schedule on again.",
  corrected: "A bill was cancelled for correction. Review the billing setup before continuing.",
  overlap: "An existing bill covers some of these dates. Review the covered periods.",
  limit: "The testing limit prevented a bill from being created. Review this month’s bill.",
  unavailable: "The automatic bill could not be created. Review this month’s bill before restarting.",
  closed: "The rental connection has closed. No more bills will be created automatically.",
  ended: "The agreed rental dates have ended.",
} as Record<string, string>)[issue] || "";

export function followingMonth(month: string) {
  if (!isBillingMonth(month)) throw new Error("Choose a valid billing month.");
  const [year, number] = month.split("-").map(Number);
  const result = number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, "0")}`;
  if (!isBillingMonth(result)) throw new Error("The supported billing dates have ended.");
  return result;
}
export function billingPreview(connection: Pick<RentalConnection, "leaseStart" | "leaseEnd" | "monthlyRentCents" | "dueDay" | "status">, now = new Date()): BillingPreview | null {
  if (connection.status !== "accepted") return null;
  const future = followingMonth(philippinesDay(now).slice(0, 7));
  const firstFull = connection.leaseStart.endsWith("-01") ? connection.leaseStart.slice(0, 7) : followingMonth(connection.leaseStart.slice(0, 7));
  const month = future > firstFull ? future : firstFull, bounds = monthBounds(month);
  if (connection.leaseEnd && bounds.last > connection.leaseEnd) return null;
  return { month, periodStart: bounds.first, periodEnd: bounds.last, dueDate: billDefaults(month, connection).dueDate, amountCents: connection.monthlyRentCents };
}
export function scheduledPeriod(month: string, connection: Pick<RentalConnection, "status" | "leaseStart" | "leaseEnd" | "monthlyRentCents" | "dueDay">, day: string): BillingPreview | { issue: string; finished: boolean } {
  if (connection.status !== "accepted") return { issue: "closed", finished: true } as const;
  const bounds = monthBounds(month);
  if (connection.leaseEnd && connection.leaseEnd < bounds.first) return { issue: "ended", finished: true } as const;
  if (month < day.slice(0, 7)) return { issue: "missed", finished: false } as const;
  if (bounds.first < connection.leaseStart || connection.leaseEnd && bounds.last > connection.leaseEnd) return { issue: "partial", finished: false } as const;
  return { month, periodStart: bounds.first, periodEnd: bounds.last, dueDate: billDefaults(month, connection).dueDate, amountCents: connection.monthlyRentCents };
}
