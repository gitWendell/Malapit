"use client";
import { useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, CircleCheck, LoaderCircle, Plus, ReceiptText } from "lucide-react";
import { philippinesDay, pesoInputToCents, rentalDate, rentalMoney } from "../lib/rentals";
import type { RentalBillDetail } from "../lib/rental-bills";
import { paymentMethods, paymentStatusLabel, rentalPaymentAction, rentalPaymentInput, type CreateRentalPayment, type RentalPaymentAction, type RentalPaymentRecord } from "../lib/rental-payments";

const message = (cause: unknown) => cause instanceof Error ? cause.message : "Please try again.";
type Actions = { record: (data: CreateRentalPayment) => Promise<void>; act: (id: string, action: RentalPaymentAction) => Promise<void> };

export function PaymentPanel({ detail, userId, busy, record, act, changePage }: { detail: RentalBillDetail; userId: string; busy: boolean; changePage: (page: number) => void } & Actions) {
  const owner = detail.bill.ownerId === userId, [adding, setAdding] = useState(false);
  const bill = detail.bill;
  return <section className="rental-payments" aria-label="Payment records">
    <div className="rental-section-heading"><div><h3>Payment records</h3><p className="form-help">Transfers happen directly between owner and renter.</p></div>{bill.status === "issued" && bill.remainingCents > 0 && !bill.pendingCount && !adding && <button className="button primary" disabled={busy} onClick={() => setAdding(true)}><Plus size={15} />{owner ? "Record received payment" : "Report a payment"}</button>}</div>
    {bill.pendingCount > 0 && <p className="payment-pending-note">{rentalMoney(bill.pendingCents)} is awaiting owner confirmation. It does not reduce the remaining balance yet.</p>}
    {adding && <PaymentForm owner={owner} remainingCents={bill.remainingCents} defaultMethod={detail.defaultPaymentMethod} busy={busy} back={() => setAdding(false)} save={async data => { await record(data); setAdding(false); }} />}
    {detail.payments.length ? <div className="payment-records">{detail.payments.map(payment => <PaymentCard key={payment.id + payment.status} payment={payment} owner={owner} userId={userId} busy={busy} act={action => act(payment.id, action)} />)}</div> : !adding && <div className="payment-empty"><ReceiptText size={24} /><p>No payments recorded yet.</p><small>{owner ? "Check your cash, bank or wallet records before confirming receipt." : "After paying the owner directly, report the amount and reference here."}</small></div>}
    {(detail.paymentPage > 0 || detail.hasMorePayments) && <div className="rent-bill-pagination"><button className="button secondary" disabled={busy || !detail.paymentPage} onClick={() => changePage(detail.paymentPage - 1)}><ChevronLeft size={15} />Previous</button><span>Page {detail.paymentPage + 1}</span><button className="button secondary" disabled={busy || !detail.hasMorePayments} onClick={() => changePage(detail.paymentPage + 1)}>Next<ChevronRight size={15} /></button></div>}
    <p className="form-help payment-record-note">Keep your original receipt. “Confirmed by owner” is the owner’s confirmation; Malapit does not process or independently verify the transfer.</p>
  </section>;
}

export function PaymentForm({ owner, remainingCents, busy, back, save, defaultMethod = "gcash" }: { owner: boolean; remainingCents: number; busy: boolean; back: () => void; save: (data: CreateRentalPayment) => Promise<void>; defaultMethod?: keyof typeof paymentMethods }) {
  const [draft, setDraft] = useState({ amount: String(remainingCents / 100), method: defaultMethod, paidAt: philippinesDay(), reference: "", note: "", duplicateReason: "" });
  const [advanced, setAdvanced] = useState(owner || defaultMethod === "other");
  const [checked, setChecked] = useState(false), [error, setError] = useState(""), [repeated, setRepeated] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  function update(key: keyof typeof draft, value: string) { setChecked(false); setDraft(previous => ({ ...previous, [key]: value })); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    const amountCents = pesoInputToCents(draft.amount);
    if (amountCents === null) { setError("Enter the amount with no more than two decimal places."); return; }
    const parsed = rentalPaymentInput.safeParse({ ...draft, amountCents, requestId: requestId.current, detailsConfirmed: checked, receiptConfirmed: owner && checked });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    try { await save(parsed.data); } catch (cause) { const text = message(cause); setError(text); if (text.includes("reference already")) setRepeated(true); }
  }
  return <form className={"payment-form" + (!owner ? " payment-form-quick" : "")} onSubmit={submit}><h4>{owner ? "Record money you already received" : "Report a payment made to the owner"}</h4><p className="form-help">Remaining in records: {rentalMoney(remainingCents)}. You may record a partial payment.</p><fieldset disabled={busy}>
  {!owner && <><div className="payment-quick-summary"><div><span>Amount</span><strong>{rentalMoney(pesoInputToCents(draft.amount) || 0)}</strong></div><div><span>Method</span><strong>{paymentMethods[draft.method]}</strong></div><div><span>Date paid</span><strong>{draft.paidAt ? rentalDate(draft.paidAt) : "Choose a date"}</strong></div></div><button className="text-link payment-edit-details" type="button" aria-expanded={advanced} onClick={() => setAdvanced(value => !value)}>{advanced ? "Keep these details" : "Change amount, method or date"}</button></>}
  {advanced && <div className="form-grid">
    <label className="field"><span>Payment amount (₱)</span><input type="number" inputMode="decimal" required min="0.01" max={remainingCents / 100} step="0.01" value={draft.amount} onChange={event => update("amount", event.target.value)} /></label>
    <label className="field"><span>Payment method</span><select value={draft.method} onChange={event => update("method", event.target.value)}>{Object.entries(paymentMethods).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label className="field"><span>Date paid</span><input type="date" required min="1900-01-01" max={philippinesDay()} value={draft.paidAt} onChange={event => update("paidAt", event.target.value)} /></label>
  </div>}
  {(owner || advanced || ["gcash", "maya", "bank"].includes(draft.method) || draft.reference) && <label className="field payment-reference-field"><span>Transaction reference{!["gcash", "maya", "bank"].includes(draft.method) ? " (optional)" : ""}</span><input autoComplete="off" required={["gcash", "maya", "bank"].includes(draft.method)} minLength={["gcash", "maya", "bank"].includes(draft.method) ? 3 : undefined} maxLength={100} value={draft.reference} onChange={event => update("reference", event.target.value)} /><small>Use the reference from this payment, not your account or card number.</small></label>}
  {(owner || advanced || draft.method === "other") && <label className="field payment-note-field"><span>{draft.method === "other" ? "How you paid" : "Payment note (optional)"}</span><textarea rows={2} required={draft.method === "other"} minLength={draft.method === "other" ? 5 : undefined} maxLength={500} value={draft.note} onChange={event => update("note", event.target.value)} /></label>}
  {owner && <label className="check-row payment-repeat-toggle"><input type="checkbox" checked={repeated} onChange={event => { setRepeated(event.target.checked); setChecked(false); if (!event.target.checked) update("duplicateReason", ""); }} /><span>This reference was used on another confirmed record.</span></label>}
  {owner && repeated && <label className="field payment-reference-reason"><span>Why this repeated reference is valid</span><textarea required minLength={5} maxLength={400} rows={2} value={draft.duplicateReason} onChange={event => update("duplicateReason", event.target.value)} /><small>A repeated reference needs checking. It is not by itself proof of a duplicate transfer.</small></label>}
  <label className="check-row rental-consent"><input type="checkbox" required checked={checked} onChange={event => setChecked(event.target.checked)} /><span>{owner ? "I checked my cash, bank or wallet records and received this payment." : "I paid this amount directly to the owner. Send this report for the owner to check."}</span></label>
  {error && <p className="form-error" role="alert">{error}</p>}<div className="rental-form-actions"><button className="button secondary" type="button" onClick={back}>Go back</button><button className="button primary" disabled={!checked} type="submit">{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{owner ? "Record received payment" : "Submit payment report"}</button></div></fieldset></form>;
}

function PaymentCard({ payment, owner, userId, busy, act }: { payment: RentalPaymentRecord; owner: boolean; userId: string; busy: boolean; act: (action: RentalPaymentAction) => Promise<void> }) {
  const [mode, setMode] = useState<"review" | "reject" | "cancel" | "reverse" | null>(null), [checked, setChecked] = useState(false), [reason, setReason] = useState(""), [duplicateReason, setDuplicateReason] = useState(""), [needsReferenceReview, setNeedsReferenceReview] = useState(payment.duplicateReference), [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    const parsed = rentalPaymentAction.safeParse(mode === "review" ? { action: "confirm", receiptConfirmed: checked, duplicateReason } : { action: mode, confirmed: checked, reason });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    try { await act(parsed.data); setMode(null); } catch (cause) { const text = message(cause); setError(text); if (text.includes("reference already")) setNeedsReferenceReview(true); }
  }
  return <article className={"payment-card payment-state-" + payment.status}>
    <div className="payment-card-heading"><span className={"status payment-status-" + payment.status}>{paymentStatusLabel(payment.status)}</span><strong>{rentalMoney(payment.amountCents)}</strong></div>
    <p className="payment-method">{paymentMethods[payment.method]} · Paid on {rentalDate(payment.paidAt)}</p>
    {payment.reference && <p className="payment-reference"><span>Reference</span>{payment.reference}</p>}
    {payment.note && <p className="payment-note">{payment.note}</p>}
    {payment.decisionReason && <p className="payment-decision"><strong>{payment.status === "rejected" ? "Correction requested" : "Renter’s reason"}</strong>{payment.decisionReason}</p>}
    {payment.reversalReason && <p className="payment-decision"><strong>Reason for reversal</strong>{payment.reversalReason}<small>This corrects a record. It does not move or return money.</small></p>}
    {payment.duplicateReason && <p className="payment-decision"><strong>Owner’s reference review</strong>{payment.duplicateReason}</p>}
    {!mode && <div className="payment-card-actions">{owner && payment.status === "pending" && <button className="button primary" disabled={busy} onClick={() => setMode("review")}>Review payment</button>}{!owner && payment.status === "pending" && payment.submittedBy === userId && <button className="text-button" disabled={busy} onClick={() => setMode("cancel")}>Cancel my report</button>}{owner && payment.status === "confirmed" && <button className="text-button" disabled={busy} onClick={() => setMode("reverse")}>Correct payment record</button>}</div>}
    {mode && <form className="payment-review" onSubmit={submit}><h4>{({ review: "Check receipt before confirming", reject: "Request a correction", cancel: "Cancel this payment report?", reverse: "Reverse this record for correction?" })[mode]}</h4><p className="form-help">{mode === "review" ? "Compare the amount, date and reference with your original cash, bank or wallet records." : mode === "reverse" ? "The original and your reason remain visible. Reversing this record changes the recorded balance; it does not return money." : mode === "reject" ? "Tell the renter what needs correcting. This report stays in the history." : "You can submit corrected details afterwards. The original report stays in the history."}</p>
      <fieldset disabled={busy}>{mode === "review" && needsReferenceReview && <label className="field payment-reference-warning"><span>Another confirmed record uses this reference. Explain why it is valid here.</span><textarea required minLength={5} maxLength={400} rows={2} value={duplicateReason} onChange={event => { setDuplicateReason(event.target.value); setChecked(false); }} /></label>}
      {mode !== "review" && <label className="field"><span>Reason</span><textarea required minLength={5} maxLength={400} rows={2} value={reason} onChange={event => { setReason(event.target.value); setChecked(false); }} /></label>}
      <label className="check-row rental-consent"><input type="checkbox" required checked={checked} onChange={event => setChecked(event.target.checked)} /><span>{mode === "review" ? "I checked my original records and received this payment." : "I checked this correction and understand that the original history will remain."}</span></label>
      {error && <p className="form-error" role="alert">{error}</p>}<div className="rental-form-actions"><button className="button secondary" type="button" onClick={() => { setMode(null); setError(""); setChecked(false); }}>Go back</button>{mode === "review" && <button className="button secondary" type="button" onClick={() => { setMode("reject"); setChecked(false); }}>Request correction</button>}<button className="button primary" disabled={!checked} type="submit">{mode === "review" ? <CircleCheck size={16} /> : null}{({ review: "Confirm receipt", reject: "Request correction", cancel: "Cancel report", reverse: "Reverse record" })[mode]}</button></div></fieldset>
    </form>}
    <details className="payment-history"><summary>Payment history</summary>{payment.events.map(event => <div key={event.id}><span>{({ submitted: "Renter reported payment", recorded: "Owner recorded receipt", confirmed: "Owner confirmed receipt", rejected: "Owner requested correction", cancelled: "Renter cancelled report", reversed: "Owner reversed record" } as Record<string, string>)[event.action] || event.action}<small>{event.actorName}</small>{event.reason && <p>{event.reason}</p>}</span><time dateTime={event.createdAt}>{rentalDate(event.createdAt)}</time></div>)}</details>
  </article>;
}
