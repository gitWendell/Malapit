import { z } from "zod";
import { isBillingMonth, RENTAL_BILL_LIMITS } from "./rental-bills.ts";
import { RENTAL_LIMITS, philippinesDay } from "./rentals.ts";
import { PAYMENT_LIMITS, paymentMethods, paymentStatusLabel, type RentalPaymentStatus } from "./rental-payments.ts";

export const REPORT_PAGE_SIZE = 25;
// Each archived unit in a report has at least one historical bill. Active
// units without bills add at most the existing per-owner allowance.
export const REPORT_UNIT_LIMIT = RENTAL_BILL_LIMITS.total + RENTAL_LIMITS.unitsPerOwner;
export const REPORT_EXPORT_LIMITS = { units: REPORT_UNIT_LIMIT, bills: RENTAL_BILL_LIMITS.total, payments: PAYMENT_LIMITS.total } as const;
export type ReportExport = keyof typeof REPORT_EXPORT_LIMITS;
export const reportQueryInput = z.object({
  month: z.string().refine(isBillingMonth, "Choose a valid billing month."),
  unitId: z.string().uuid("Choose one of your own units.").nullable(),
  page: z.coerce.number().int().min(0).max(Math.ceil(REPORT_UNIT_LIMIT / REPORT_PAGE_SIZE)),
});
export function parseReportQuery(url: URL) {
  return reportQueryInput.parse({ month: url.searchParams.get("month") ?? philippinesDay().slice(0, 7), unitId: url.searchParams.get("unitId") ?? null, page: url.searchParams.get("page") ?? 0 });
}
export type ReportTotals = { billCount: number; cancelledBillCount: number; billedCents: number; confirmedCents: number; remainingCents: number; pendingCents: number; pendingCount: number };
export type UnitReport = ReportTotals & { unitId: string; propertyName: string; unitName: string; archivedAt: string | null };
export type OwnerReport = { month: string; generatedAt: string; unitId: string | null; units: UnitReport[]; unitCount: number; totals: ReportTotals; page: number; hasMore: boolean };
export function reportTotals(rows: UnitReport[]): ReportTotals {
  const total: ReportTotals = { billCount: 0, cancelledBillCount: 0, billedCents: 0, confirmedCents: 0, remainingCents: 0, pendingCents: 0, pendingCount: 0 };
  for (const row of rows) for (const key of Object.keys(total) as (keyof ReportTotals)[]) total[key] += row[key];
  return total;
}
export type BillReportRow = {
  billId: string; unitId: string; connectionId: string; propertyName: string; unitName: string; renterName: string;
  month: string; periodStart: string; periodEnd: string; dueDate: string; status: "issued" | "voided"; source: string;
  amountCents: number; billedCents: number; confirmedCents: number; remainingCents: number; pendingCents: number; pendingCount: number;
  createdAt: string; voidedAt: string | null; voidReason: string | null;
};
export type PaymentReportRow = {
  paymentId: string; billId: string; unitId: string; propertyName: string; unitName: string; renterName: string;
  month: string; billStatus: "issued" | "voided"; paidAt: string; method: keyof typeof paymentMethods; reference: string;
  amountCents: number; confirmedCents: number; status: RentalPaymentStatus; note: string; createdAt: string;
  reviewedAt: string | null; decisionReason: string | null; duplicateReason: string | null; reversedAt: string | null; reversalReason: string | null;
};

// Quote every field, escape delimiters/newlines and neutralise spreadsheet
// formulas, including whitespace/control and full-width variants. The tab is
// intentional text protection for Excel, not part of the original record.
export function csvCell(value: unknown) {
  let text = value === null || value === undefined ? "" : String(value);
  text = text.replace(/\u0000/g, "");
  if (/^[\s\u0001-\u001f\u007f]*[=+\-@＝＋－＠]/u.test(text) || /^[\t\r\n]/.test(text)) text = "\t" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export const csvDocument = (rows: unknown[][]) => "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
const money = (cents: number) => (cents / 100).toFixed(2);
export function unitReportCsv(rows: UnitReport[], month: string, generatedAt: string) {
  return csvDocument([
    ["Billing month", "Snapshot at (UTC)", "Currency", "Unit ID", "Property", "Unit", "Archived", "Current bills", "Cancelled bills excluded", "Rent billed PHP", "Confirmed for these bills PHP", "Remaining PHP", "Awaiting confirmation PHP", "Pending reports"],
    ...rows.map(r => [month, generatedAt, "PHP", r.unitId, r.propertyName, r.unitName, r.archivedAt ? "Yes" : "No", r.billCount, r.cancelledBillCount, money(r.billedCents), money(r.confirmedCents), money(r.remainingCents), money(r.pendingCents), r.pendingCount]),
  ]);
}
export function billReportCsv(rows: BillReportRow[], generatedAt: string) {
  return csvDocument([
    ["Billing month", "Snapshot at (UTC)", "Currency", "Bill ID", "Connection ID", "Unit ID", "Property on bill", "Unit on bill", "Renter on bill", "Covered from", "Covered until", "Due date", "Bill status", "Bill source", "Original amount PHP", "Current rent billed PHP", "Confirmed for this bill PHP", "Remaining PHP", "Awaiting confirmation PHP", "Pending reports", "Created at (UTC)", "Cancelled at (UTC)", "Cancellation reason"],
    ...rows.map(r => [r.month, generatedAt, "PHP", r.billId, r.connectionId, r.unitId, r.propertyName, r.unitName, r.renterName, r.periodStart, r.periodEnd, r.dueDate, r.status === "issued" ? "Current" : "Cancelled", r.source, money(r.amountCents), money(r.billedCents), money(r.confirmedCents), money(r.remainingCents), money(r.pendingCents), r.pendingCount, r.createdAt, r.voidedAt, r.voidReason]),
  ]);
}
export function paymentReportCsv(rows: PaymentReportRow[], generatedAt: string) {
  return csvDocument([
    ["Bill billing month", "Snapshot at (UTC)", "Currency", "Payment ID", "Bill ID", "Unit ID", "Property on bill", "Unit on bill", "Renter on bill", "Bill status", "Date paid (reported)", "Method", "Reference", "Original payment amount PHP", "Current confirmed credit PHP", "Payment status", "Note", "Submitted at (UTC)", "Reviewed at (UTC)", "Decision reason", "Repeated reference explanation", "Reversed at (UTC)", "Reversal reason"],
    ...rows.map(r => [r.month, generatedAt, "PHP", r.paymentId, r.billId, r.unitId, r.propertyName, r.unitName, r.renterName, r.billStatus === "issued" ? "Current" : "Cancelled", r.paidAt, paymentMethods[r.method], r.reference, money(r.amountCents), money(r.confirmedCents), paymentStatusLabel(r.status), r.note, r.createdAt, r.reviewedAt, r.decisionReason, r.duplicateReason, r.reversedAt, r.reversalReason]),
  ]);
}
