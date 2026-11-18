import { env } from "cloudflare:workers";
import { z } from "zod";
import type { AuthIdentity } from "./auth";
import { HttpError } from "./server";
import { ownerBillsReportQuery, ownerPaymentsReportQuery, ownerUnitsReportQuery } from "./rental-report-queries";
import { billReportCsv, parseReportQuery, paymentReportCsv, REPORT_EXPORT_LIMITS, REPORT_PAGE_SIZE, REPORT_UNIT_LIMIT, reportTotals, unitReportCsv, type BillReportRow, type OwnerReport, type PaymentReportRow, type UnitReport } from "./rental-reports";

async function rows<T>(query: { sql: string; params: (string | null)[] }, limit: number): Promise<T[]> {
  if (!env.DB) throw new HttpError(503, "Your reports are temporarily unavailable.");
  const result = await env.DB.prepare(query.sql).bind(...query.params).all<T>();
  if (result.results.length > limit) throw new HttpError(503, "This report is too large. Choose one unit or contact support.");
  return result.results;
}
export async function ownerReportFor(url: URL, user: AuthIdentity): Promise<OwnerReport> {
  const { month, unitId, page } = parseReportQuery(url);
  // One statement supplies all unit totals from the same database read. Page
  // slicing happens afterward, so totals never describe just the visible page.
  const units = await rows<UnitReport>(ownerUnitsReportQuery(user.userId, month, unitId), REPORT_UNIT_LIMIT);
  if (unitId && !units.length) throw new HttpError(404, "This unit is not available to this account.");
  const start = page * REPORT_PAGE_SIZE;
  return { month, unitId, generatedAt: new Date().toISOString(), units: units.slice(start, start + REPORT_PAGE_SIZE), unitCount: units.length, totals: reportTotals(units), page, hasMore: units.length > start + REPORT_PAGE_SIZE };
}
export async function ownerReportExport(url: URL, user: AuthIdentity) {
  const { month, unitId } = parseReportQuery(url);
  const kind = z.enum(["units", "bills", "payments"]).parse(url.searchParams.get("kind"));
  // Explicit filters must name an owned unit, even when that month is empty.
  if (unitId) {
    if (!env.DB) throw new HttpError(503, "Your reports are temporarily unavailable.");
    const own = await env.DB.prepare("SELECT id FROM rental_units WHERE id=? AND owner_id=?").bind(unitId, user.userId).first();
    if (!own) throw new HttpError(404, "This unit is not available to this account.");
  }
  let csv: string;
  const generatedAt = new Date().toISOString();
  if (kind === "units") csv = unitReportCsv(await rows<UnitReport>(ownerUnitsReportQuery(user.userId, month, unitId), REPORT_EXPORT_LIMITS.units), month, generatedAt);
  else if (kind === "bills") csv = billReportCsv(await rows<BillReportRow>(ownerBillsReportQuery(user.userId, month, unitId), REPORT_EXPORT_LIMITS.bills), generatedAt);
  else csv = paymentReportCsv(await rows<PaymentReportRow>(ownerPaymentsReportQuery(user.userId, month, unitId), REPORT_EXPORT_LIMITS.payments), generatedAt);
  return new Response(csv, { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="malapit-${kind}-${month}${unitId ? "-unit-" + unitId : ""}.csv"`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
  } });
}
