"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, FileChartColumn, Filter, LoaderCircle, RefreshCw } from "lucide-react";
import { today } from "../lib/client";
import { billMonthLabel, isBillingMonth } from "../lib/rental-bills";
import { rentalMoney } from "../lib/rentals";
import { REPORT_PAGE_SIZE, type OwnerReport, type ReportExport } from "../lib/rental-reports";

const exports: [ReportExport, string][] = [["units", "Unit summary"], ["bills", "Bill records"], ["payments", "Payment history"]];
const errorText = (error: unknown) => error instanceof Error ? error.message : "Please try again.";
export function OwnerReports({ refreshKey, busy, openUnits }: { refreshKey: number; busy: boolean; openUnits: () => void }) {
  const [month, setMonth] = useState(() => today().slice(0, 7)), [unit, setUnit] = useState<{ id: string; label: string } | null>(null), [page, setPage] = useState(0), [reload, setReload] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; report: OwnerReport } | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [downloading, setDownloading] = useState<ReportExport | null>(null), [downloadMessage, setDownloadMessage] = useState(""), [downloadError, setDownloadError] = useState("");
  const downloadRequest = useRef<AbortController | null>(null);
  const params = new URLSearchParams({ month, page: String(page), ...(unit ? { unitId: unit.id } : {}) }).toString();
  useEffect(() => {
    const controller = new AbortController();
    setError(""); setLoading(true);
    if (!isBillingMonth(month)) { setLoading(false); return; }
    void fetch("/api/rentals/reports?" + params, { credentials: "same-origin", cache: "no-store", signal: controller.signal }).then(async response => {
      const value = await response.json() as OwnerReport & { error?: string };
      if (!response.ok) throw new Error(value.error || "We couldn’t load your report.");
      if (!controller.signal.aborted) setLoaded({ key: params, report: value });
    }).catch(cause => { if (!controller.signal.aborted) setError(errorText(cause)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [month, params, refreshKey, reload]);
  useEffect(() => {
    setDownloadMessage(""); setDownloadError(""); setDownloading(null);
    return () => { downloadRequest.current?.abort(); downloadRequest.current = null; };
  }, [month, unit?.id]);
  const current = !loading && !error && loaded?.key === params ? loaded.report : null;

  async function download(kind: ReportExport) {
    const controller = new AbortController();
    downloadRequest.current?.abort(); downloadRequest.current = controller;
    setDownloading(kind); setDownloadError(""); setDownloadMessage("");
    try {
      const query = new URLSearchParams({ month, kind, ...(unit ? { unitId: unit.id } : {}) });
      const response = await fetch("/api/rentals/reports/export?" + query, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      if (!response.ok) { const value = await response.json() as { error?: string }; throw new Error(value.error || "We couldn’t prepare that download."); }
      if (!response.headers.get("content-type")?.startsWith("text/csv")) throw new Error("We couldn’t prepare that download. Please refresh and try again.");
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const href = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = href;
      link.download = response.headers.get("content-disposition")?.match(/filename="([a-z0-9.-]+)"/)?.[1] || `malapit-${kind}-${month}.csv`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      setDownloadMessage("Your file is ready. Check your browser’s downloads.");
    } catch (cause) { if (!controller.signal.aborted) setDownloadError(errorText(cause)); }
    finally { if (!controller.signal.aborted) { setDownloading(null); downloadRequest.current = null; } }
  }

  return <section className="owner-report" aria-label="Monthly owner report">
    <div className="owner-report-heading"><div><p className="eyebrow">A clearer view of your rentals</p><h2>Monthly report</h2><p>See what’s billed, confirmed and still to check.</p></div><div className="owner-report-controls"><label className="field"><span>Report billing month</span><input type="month" min="1900-01" max="2200-12" required value={month} onChange={event => { setMonth(event.target.value); setPage(0); }} /></label><button className="button secondary" aria-label="Refresh owner report" disabled={loading || busy} onClick={() => setReload(value => value + 1)}><RefreshCw size={16} /></button></div></div>
    {unit && <div className="owner-report-filter"><span><Filter size={14} />{unit.label}</span><button className="text-button" onClick={() => { setUnit(null); setPage(0); }}><ArrowLeft size={14} />All units</button></div>}
    {error ? <div className="rental-load-error" role="alert"><p>{error}</p><button className="text-link" onClick={() => setReload(value => value + 1)}>Try again</button></div> : !isBillingMonth(month) ? <p className="owner-report-empty">Choose a billing month to see your report.</p> : loading ? <p className="loading-inline" role="status"><LoaderCircle className="spin" size={18} />Loading your report…</p> : null}
    {current && <>
      <div className="stat-grid owner-report-stats"><div><span>Rent billed</span><strong>{rentalMoney(current.totals.billedCents)}</strong><small>{current.totals.billCount} current {current.totals.billCount === 1 ? "bill" : "bills"}</small></div><div><span>Confirmed for these bills</span><strong>{rentalMoney(current.totals.confirmedCents)}</strong><small>Receipt checked by owner</small></div><div><span>Remaining in records</span><strong>{rentalMoney(current.totals.remainingCents)}</strong><small>Based on confirmed receipts</small></div><div><span>Awaiting confirmation</span><strong>{rentalMoney(current.totals.pendingCents)}</strong><small>{current.totals.pendingCount} {current.totals.pendingCount === 1 ? "report" : "reports"} to check</small></div></div>
      <p className="owner-report-basis">Totals follow the bill’s billing month and use the latest records, including payments made in other months. Pending reports do not reduce the balance.{current.totals.cancelledBillCount > 0 ? ` ${current.totals.cancelledBillCount} cancelled ${current.totals.cancelledBillCount === 1 ? "bill is" : "bills are"} excluded from totals.` : " Cancelled bills are excluded from totals."}</p>
      <div className="owner-report-unit-heading"><h3>{unit ? "Selected unit" : "By unit"}</h3><span>{current.unitCount} {current.unitCount === 1 ? "unit" : "units"}{!unit && " · active units and this month’s archived records"}</span></div>
      {current.units.length ? <div className="owner-report-units">{current.units.map(row => <article className="owner-report-unit" key={row.unitId}>
        <div className="owner-report-unit-name"><p>{row.propertyName}</p><h4>{row.unitName}</h4><small>{row.archivedAt ? "Archived · " : ""}{row.billCount ? `${row.billCount} current ${row.billCount === 1 ? "bill" : "bills"}` : "No current bill this month"}</small></div>
        <dl><div><dt>Rent billed</dt><dd>{rentalMoney(row.billedCents)}</dd></div><div><dt>Confirmed</dt><dd>{rentalMoney(row.confirmedCents)}</dd></div><div><dt>Remaining</dt><dd>{rentalMoney(row.remainingCents)}</dd></div><div><dt>Awaiting check</dt><dd>{rentalMoney(row.pendingCents)}<small>{row.pendingCount} {row.pendingCount === 1 ? "report" : "reports"}</small></dd></div></dl>
        {!unit && <button className="text-button owner-report-unit-action" aria-label={`View report for ${row.propertyName}, ${row.unitName}`} onClick={() => { setUnit({ id: row.unitId, label: row.propertyName + " · " + row.unitName }); setPage(0); }}><Filter size={14} /><span>View unit</span></button>}
      </article>)}</div> : <div className="owner-report-empty"><FileChartColumn size={28} /><h3>{current.unitCount ? "No units on this page" : "Your records will appear here"}</h3><p>{current.unitCount ? "Go back to the first page to see this month’s units." : "Add a private unit and create its rent bill to start your monthly report."}</p><button className="button secondary" onClick={current.unitCount ? () => setPage(0) : openUnits}>{current.unitCount ? "First page" : "Go to My units"}</button></div>}
      {(page > 0 || current.hasMore) && <div className="owner-report-pagination"><button className="button secondary" disabled={loading || page === 0} onClick={() => setPage(value => value - 1)}><ChevronLeft size={16} />Previous</button><span>Page {page + 1} · {Math.min(page * REPORT_PAGE_SIZE + 1, current.unitCount)}–{Math.min((page + 1) * REPORT_PAGE_SIZE, current.unitCount)} of {current.unitCount}</span><button className="button secondary" disabled={loading || !current.hasMore} onClick={() => setPage(value => value + 1)}>Next<ChevronRight size={16} /></button></div>}
      <section className="owner-report-downloads" aria-label="Download owner records"><div><Download size={20} /><div><h3>Download for Excel</h3><p>CSV files include every matching record across all pages.{unit ? " Filtered to this unit." : " For all your units in this billing month."}</p></div></div><div className="owner-report-download-buttons">{exports.map(([kind, label]) => <button className={"button " + (kind === "units" ? "primary" : "secondary")} key={kind} disabled={busy || downloading !== null || current.unitCount === 0} onClick={() => void download(kind)}>{downloading === kind ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}{label}</button>)}</div><p className="form-help">Bill and payment downloads keep cancelled and corrected records, with their status and reasons. Exports use the latest records when requested. Store downloaded private records carefully.</p>{downloadMessage && <p className="owner-report-download-status" role="status">{downloadMessage}</p>}{downloadError && <p className="form-error" role="alert">{downloadError}</p>}</section>
      <p className="owner-report-updated">Updated {new Date(current.generatedAt).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })} · Philippine time</p><p className="form-help">Malapit records owner-confirmed receipts. Check original bank, wallet and cash records when reviewing differences. These figures do not calculate profit, expenses or tax.</p>
    </>}
  </section>;
}
