"use client";
import { useEffect, useState } from "react";
import { ArrowRight, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../lib/client";
import { rentalDate, rentalMoney } from "../lib/rentals";
import { paymentMethods, type RentalPaymentAction } from "../lib/rental-payments";
import { scheduleIssueLabel } from "../lib/rental-billing";
import type { PendingPaymentTask, RentalWorkload } from "../lib/rental-workload";

export function RentalTasks({ role, refreshKey, busy, openBill, report, openRental, review }: { role: "owner" | "renter"; refreshKey: number; busy: boolean; openBill: (id: string) => void; report: (id: string) => void; openRental: (id: string) => void; review: (id: string, action: RentalPaymentAction) => Promise<void> }) {
  const [data, setData] = useState<RentalWorkload | null>(null), [page, setPage] = useState(0), [error, setError] = useState(""), [expanded, setExpanded] = useState(false);
  useEffect(() => { let cancelled = false; api<RentalWorkload>(`/api/rentals/tasks?role=${role}&page=${page}`, undefined, "GET").then(value => { if (!cancelled) { setData(value); setError(""); } }).catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Please refresh My Rentals."); }); return () => { cancelled = true; }; }, [role, page, refreshKey]);
  if (error) return <p className="rental-task-error" role="alert">Could not refresh your quick actions. {error} Use Refresh My Rentals to try again.</p>;
  if (!data || data.role !== role || !data.pendingTotal && !data.dueTotal && !data.scheduleIssues.length) return null;
  const items = role === "owner" ? data.pendingPayments : data.dueBills, visible = expanded ? items : items.slice(0, 3);
  return <section className="rental-tasks" aria-label={role === "owner" ? "Payments to check" : "Your rent bills to pay"}>
    <div className="rental-section-heading"><div><p className="eyebrow">{role === "owner" ? "A quick check" : "Your next step"}</p><h2>{role === "owner" ? `${data.pendingTotal} payment${data.pendingTotal === 1 ? "" : "s"} to check` : "Your rent bills"}</h2></div><span className="rental-task-count">{role === "owner" ? data.pendingTotal : data.dueTotal}</span></div>
    {role === "owner" ? <div className="rental-task-list">{(visible as PendingPaymentTask[]).map(payment => <PendingTask key={payment.id} payment={payment} busy={busy} review={action => review(payment.id, action)} open={() => openBill(payment.billId)} />)}</div> : <div className="rental-task-list">{(visible as RentalWorkload["dueBills"]).map(bill => <article className="rental-due-task" key={bill.id}><div><p>{bill.propertyName} · {bill.unitName}</p><h3>{rentalMoney(bill.remainingCents)} <span>remaining</span></h3><small>Due {rentalDate(bill.dueDate)}</small>{bill.pendingCount > 0 && <p className="payment-pending-text">{rentalMoney(bill.pendingCents)} is awaiting owner confirmation.</p>}</div><button className={"button " + (bill.pendingCount ? "secondary" : "primary")} disabled={busy} onClick={() => bill.pendingCount ? openBill(bill.id) : report(bill.id)}>{bill.pendingCount ? "View report" : "Report a payment"}<ArrowRight size={15} /></button></article>)}</div>}
    {items.length > 3 && <button className="text-link rental-tasks-more" onClick={() => setExpanded(value => !value)}>{expanded ? "Show fewer" : `Show all ${items.length} on this page`}</button>}
    {(page > 0 || data.hasMore) && <div className="rent-bill-pagination"><button className="button secondary" disabled={busy || !page} onClick={() => { setPage(page - 1); setExpanded(false); }}><ChevronLeft size={14} />Previous</button><span>Page {page + 1}</span><button className="button secondary" disabled={busy || !data.hasMore} onClick={() => { setPage(page + 1); setExpanded(false); }}>Next<ChevronRight size={14} /></button></div>}
    {data.scheduleIssues.map(issue => <div className="billing-task-issue" key={issue.connectionId}><div><strong>{issue.propertyName} · {issue.unitName}</strong><p>{scheduleIssueLabel(issue.issue)}</p></div><button className="button secondary" disabled={busy} onClick={() => openRental(issue.connectionId)}>Review billing<ArrowRight size={14} /></button></div>)}
  </section>;
}

function PendingTask({ payment, busy, review, open }: { payment: PendingPaymentTask; busy: boolean; review: (action: RentalPaymentAction) => Promise<void>; open: () => void }) {
  const [checked, setChecked] = useState(false), [rejecting, setRejecting] = useState(false), [reason, setReason] = useState(""), [referenceReason, setReferenceReason] = useState(""), [duplicate, setDuplicate] = useState(payment.duplicateReference), [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    try { await review(rejecting ? { action: "reject", confirmed: checked as true, reason } : { action: "confirm", receiptConfirmed: checked as true, duplicateReason: referenceReason }); }
    catch (cause) { const message = cause instanceof Error ? cause.message : "Please try again."; setError(message); setChecked(false); if (message.includes("reference already")) setDuplicate(true); }
  }
  return <article className="rental-pending-task"><div className="rental-task-heading"><div><p>{payment.propertyName} · {payment.unitName}</p><h3>{payment.renterName || "Your renter"}</h3></div><strong>{rentalMoney(payment.amountCents)}</strong></div><p className="rental-task-method">{paymentMethods[payment.method]} · Paid {rentalDate(payment.paidAt)}</p>{payment.reference && <p className="rental-task-reference"><span>Reference</span>{payment.reference}</p>}{payment.note && <p className="form-help">{payment.note}</p>}
    <form onSubmit={submit}><fieldset disabled={busy}>
      {rejecting ? <label className="field"><span>What needs correcting?</span><textarea required minLength={5} maxLength={400} rows={2} value={reason} onChange={event => { setReason(event.target.value); setChecked(false); }} /></label> : duplicate && <label className="field"><span>This reference was already used. Explain why it is valid here.</span><textarea required minLength={5} maxLength={400} rows={2} value={referenceReason} onChange={event => { setReferenceReason(event.target.value); setChecked(false); }} /></label>}
      <label className="check-row rental-consent"><input type="checkbox" required checked={checked} onChange={event => setChecked(event.target.checked)} /><span>{rejecting ? "I checked this correction. The original report will stay in the history." : "I checked my original cash, bank or wallet records and received this payment."}</span></label>
      {error && <p className="form-error" role="alert">{error}</p>}<div className="rental-task-actions"><button className="text-button" type="button" onClick={open}>Open bill</button><button className="button secondary" type="button" onClick={() => { setRejecting(value => !value); setChecked(false); setError(""); }}>{rejecting ? "Go back" : "Request correction"}</button><button className="button primary" type="submit" disabled={!checked}><Check size={14} />{rejecting ? "Send correction" : "Confirm receipt"}</button></div>
    </fieldset></form>
  </article>;
}
