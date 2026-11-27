import { z } from "zod";
import { rentalUnitInput, type RentalStatus } from "./rentals.ts";
import { rentalBillInput, billPeriodError, monthBounds } from "./rental-bills.ts";

export const inquiryRentalInput = z.object({
  requestId: z.string().uuid(), terms: rentalUnitInput,
  firstBill: rentalBillInput.innerType().omit({ requestId: true, connectionId: true, detailsConfirmed: true }).superRefine((value, ctx) => {
    const parsed = rentalBillInput.safeParse({ ...value, requestId: "00000000-0000-4000-8000-000000000001", connectionId: "00000000-0000-4000-8000-000000000002", detailsConfirmed: true });
    if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue(issue);
  }),
  sharingConfirmed: z.literal(true),
}).superRefine((value, ctx) => {
  const error = billPeriodError(value.firstBill, value.terms);
  if (error) ctx.addIssue({ code: "custom", path: ["firstBill"], message: error });
  if (value.firstBill.periodStart !== value.terms.leaseStart) ctx.addIssue({ code: "custom", path: ["firstBill"], message: "The first rent bill must start on the rental start date." });
});
export type InquiryRentalInput = z.infer<typeof inquiryRentalInput>;
export type InquiryRentalSummary = { connectionId: string; status: RentalStatus; billId: string | null; billStatus?: string | null; remainingCents?: number | null; pendingPayment?: boolean | number };
export type FirstRentBill = { firstBillId: string; amountCents: number; periodStart: string; periodEnd: string; dueDate: string; note: string };
export type InquiryRentalSetup = { terms: z.infer<typeof rentalUnitInput>; renterName: string; firstBill: InquiryRentalInput["firstBill"] };
export function firstRentPeriod(leaseStart: string, leaseEnd: string | null) {
  // Use the remaining calendar month so later automatic monthly bills do not overlap.
  const last = monthBounds(leaseStart.slice(0, 7)).last;
  return { periodStart: leaseStart, periodEnd: leaseEnd && leaseEnd < last ? leaseEnd : last };
}
