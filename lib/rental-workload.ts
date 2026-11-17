import type { RentalBillSummary } from "./rental-bills";
import type { paymentMethods } from "./rental-payments";
export type PendingPaymentTask = {
  id: string; billId: string; connectionId: string; propertyName: string; unitName: string; renterName: string | null;
  amountCents: number; method: keyof typeof paymentMethods; paidAt: string; reference: string; note: string; createdAt: string; duplicateReference: boolean;
};
export type BillingIssueTask = { connectionId: string; propertyName: string; unitName: string; nextMonth: string; issue: string };
export type RentalWorkload = {
  role: "owner" | "renter"; page: number; pendingPayments: PendingPaymentTask[]; pendingTotal: number; dueBills: RentalBillSummary[]; dueTotal: number;
  scheduleIssues: BillingIssueTask[]; hasMore: boolean;
};
