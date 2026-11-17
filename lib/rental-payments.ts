import { z } from "zod";
import { isCivilDate, philippinesDay } from "./rentals.ts";

export const PAYMENT_LIMITS = { total: 20000, dailyPerPerson: 30 } as const;
export const paymentMethods = { cash: "Cash", gcash: "GCash", maya: "Maya", bank: "Bank transfer", other: "Other" } as const;
export const referenceKey = (value: string) => value.normalize("NFKC").replace(/\s+/g, "").toLowerCase() || null;
export const rentalPaymentInput = z.object({
  requestId: z.string().uuid(), amountCents: z.number().int().min(1, "Enter an amount greater than zero.").max(100000000),
  method: z.enum(["cash", "gcash", "maya", "bank", "other"]),
  paidAt: z.string().refine(isCivilDate, "Enter a valid payment date.").refine(value => value <= philippinesDay(), "A payment date cannot be in the future."),
  reference: z.string().trim().max(100).default(""), note: z.string().trim().max(500).default(""),
  detailsConfirmed: z.literal(true), receiptConfirmed: z.boolean().default(false), duplicateReason: z.string().trim().max(400).default(""),
}).superRefine((data, context) => {
  if (["gcash", "maya", "bank"].includes(data.method) && data.reference.length < 3) context.addIssue({ code: "custom", path: ["reference"], message: "Add the transaction reference so the owner can check it." });
  if (data.method === "other" && data.note.length < 5) context.addIssue({ code: "custom", path: ["note"], message: "Describe the payment method in the note." });
  if (data.duplicateReason && data.duplicateReason.length < 5) context.addIssue({ code: "custom", path: ["duplicateReason"], message: "Explain the repeated reference in at least 5 characters." });
});
export const rentalPaymentAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm"), receiptConfirmed: z.literal(true), duplicateReason: z.string().trim().max(400).default("") }),
  z.object({ action: z.enum(["reject", "cancel", "reverse"]), confirmed: z.literal(true), reason: z.string().trim().min(5, "Give a reason in at least 5 characters.").max(400) }),
]).superRefine((data, context) => { if (data.action === "confirm" && data.duplicateReason && data.duplicateReason.length < 5) context.addIssue({ code: "custom", path: ["duplicateReason"], message: "Explain the repeated reference in at least 5 characters." }); });
export type CreateRentalPayment = z.infer<typeof rentalPaymentInput>;
export type RentalPaymentAction = z.infer<typeof rentalPaymentAction>;
export type RentalPaymentStatus = "pending" | "confirmed" | "rejected" | "cancelled" | "reversed";
export type RentalPayment = {
  id: string; billId: string; ownerId: string; renterId: string; submittedBy: string; amountCents: number;
  method: keyof typeof paymentMethods; paidAt: string; reference: string; referenceKey: string | null; note: string;
  status: RentalPaymentStatus; createdAt: string; createdDay: string;
  reviewedAt: string | null; reviewedBy: string | null; decisionReason: string | null; duplicateReason: string | null;
  reversedAt: string | null; reversedBy: string | null; reversalReason: string | null;
};
export type RentalPaymentEvent = { id: string; paymentId: string; actorId: string; actorName: string; action: string; reason: string; createdAt: string };
export type RentalPaymentRecord = RentalPayment & { duplicateReference: boolean; events: RentalPaymentEvent[] };
export type BillBalances = { confirmedCents: number; pendingCents: number; pendingCount: number; remainingCents: number };
export const paymentStatusLabel = (status: RentalPaymentStatus) => ({ pending: "Awaiting confirmation", confirmed: "Confirmed by owner", rejected: "Correction requested", cancelled: "Cancelled by renter", reversed: "Record reversed" }[status]);
export function billPaymentState(amountCents: number, confirmedCents: number) { return confirmedCents >= amountCents ? "paid" : confirmedCents > 0 ? "partial" : "unpaid"; }
export const billPaymentLabel = (state: ReturnType<typeof billPaymentState>) => ({ paid: "Paid", partial: "Partly paid", unpaid: "Unpaid in records" }[state]);
