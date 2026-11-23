"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, FileText, LoaderCircle, RefreshCw } from "lucide-react";
import { api } from "../lib/client";
import { philippinesDay, pesoInputToCents, rentalDate, rentalMoney, type RentalConnection } from "../lib/rentals";
import { billDateLabel, billDateStatus, billDefaults, billMonthLabel, billPeriodError, initialBillMonth, isBillingMonth, rentalBillAction, rentalBillInput, type CreateRentalBill, type RentalBill, type RentalBillDetail, type RentalBillWithBalance, type RentalBillsPage, type RentalBillSummary } from "../lib/rental-bills";
import { billPaymentLabel, billPaymentState, type CreateRentalPayment, type RentalPaymentAction } from "../lib/rental-payments";
import { PaymentPanel } from "./rental-payments";

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Please try again.";
const paymentNote = "Balances use owner-confirmed records. Money is paid directly; Malapit does not move it.";

export function BillRows({ bills, busy, open }: { bills: (RentalBillWithBalance | RentalBillSummary)[]; busy: boolean; open: (id: string) => void }) {
  return <div className="rent-bill-list">{bills.map(bill => {
    const state = billDateStatus(bill), payment = billPaymentState(bill.amountCents, bill.confirmedCents);
    return <button key={bill.id} className="rent-bill-row" disabled={busy} onClick={() => open(bill.id)} aria-label={"View " + billMonthLabel(bill.month) + " rent bill" + ("unitName" in bill ? " for " + bill.unitName : "") + (bill.status === "voided" ? ", cancelled" : "")}>
      <span className="rent-bill-icon"><FileText size={19} /></span>
      <span className="rent-bill-main"><strong>{billMonthLabel(bill.month)}</strong>{"unitName" in bill && <span>{bill.propertyName} · {bill.unitName}</span>}<small>{rentalDate(bill.periodStart)} – {rentalDate(bill.periodEnd)}</small><span className={"status " + (bill.status === "voided" ? "rent-bill-state-voided" : "bill-payment-" + payment)}>{bill.status === "voided" ? "Cancelled" : billPaymentLabel(payment)}</span>{bill.remainingCents > 0 && <small>{billDateLabel(state)}</small>}{bill.pendingCount > 0 && <small className="payment-pending-text">{rentalMoney(bill.pendingCents)} awaiting confirmation</small>}</span>
      <span className="rent-bill-amount"><strong>{rentalMoney(bill.amountCents)}</strong><small>Remaining {rentalMoney(bill.remainingCents)}</small><small>Due {rentalDate(bill.dueDate)}</small></span><ArrowRight className="rent-bill-arrow" size={16} />
    </button>;
  })}</div>;
}

export function BillOverview({ role, refreshKey, busy, open }: { role: "owner" | "renter"; refreshKey: number; busy: boolean; open: (id: string) => void }) {
  const [month, setMonth] = useState(() => philippinesDay().slice(0, 7)), [page, setPage] = useState(0), [reload, setReload] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; value: RentalBillsPage } | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const queryKey = role + ":" + month + ":" + page;
  useEffect(() => {
    let cancelled = false;
    setError(""); setLoading(true);
    if (!isBillingMonth(month)) { setLoading(false); return; }
    api<RentalBillsPage>("/api/rentals/bills?role=" + role + "&month=" + month + "&page=" + page, undefined, "GET").then(value => { if (!cancelled) setLoaded({ key: queryKey, value }); }).catch(cause => { if (!cancelled) setError(errorMessage(cause)); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [month, page, role, queryKey, refreshKey, reload]);
  const current = loaded?.key === queryKey ? loaded.value : null;
  return <section className="rent-bill-overview" aria-label="Monthly rent bills">
    <div className="rent-bill-heading"><div><p className="eyebrow">Your monthly records</p><h2>Rent bills</h2></div><div className="rent-bill-filters"><label className="field"><span>Billing month</span><input type="month" min="1900-01" max="2200-12" required value={month} onChange={event => { setMonth(event.target.value); setPage(0); }} /></label><button className="button secondary" aria-label="Refresh rent bills" disabled={loading || busy} onClick={() => setReload(value => value + 1)}><RefreshCw size={16} /></button></div></div>
    {current && <><div className="stat-grid rent-bill-stats"><div><span>Rent billed</span><strong>{rentalMoney(current.totals.amountCents)}</strong><small>{current.totals.count} current {current.totals.count === 1 ? "bill" : "bills"} · cancelled bills excluded</small></div><div><span>Confirmed for these bills</span><strong>{rentalMoney(current.totals.confirmedCents)}</strong><small>Confirmed by the owner</small></div><div><span>Remaining in records</span><strong>{rentalMoney(current.totals.remainingCents)}</strong><small>{current.totals.today} due today · {current.totals.past} past due</small></div></div>{current.totals.pendingCount > 0 && <p className="payment-pending-note">{current.totals.pendingCount} {current.totals.pendingCount === 1 ? "report" : "reports"} awaiting confirmation · {rentalMoney(current.totals.pendingCents)}. Pending amounts are separate from confirmed payments.</p>}</>}
    {error ? <div className="rental-load-error" role="alert"><p>{error}</p><button className="text-link" onClick={() => setReload(value => value + 1)}>Try again</button></div> : !isBillingMonth(month) ? <p className="rent-bill-empty">Choose a billing month to see its records.</p> : !current && loading ? <p className="loading-inline"><LoaderCircle className="spin" size={17} />Loading rent bills…</p> : current?.bills.length ? <BillRows bills={current.bills} busy={busy || loading} open={open} /> : <div className="rent-bill-empty"><FileText size={24} /><h3>No bills for {billMonthLabel(month)}</h3><p>{role === "owner" ? "Open a connected rental and choose Create rent bill. Check its covered dates and agreed amount before sharing." : "When your owner creates a rent bill for this month, you can review it here."}</p></div>}
    {current && (page > 0 || current.hasMore) && <div className="rent-bill-pagination"><button className="button secondary" disabled={loading || page === 0} onClick={() => setPage(value => value - 1)}><ChevronLeft size={16} />Previous</button><span>Page {page + 1}</span><button className="button secondary" disabled={loading || !current.hasMore} onClick={() => setPage(value => value + 1)}>Next<ChevronRight size={16} /></button></div>}
    <p className="form-help rent-bill-payment-note">{paymentNote} Totals are for the selected bills, rather than the date money was received.</p>
  </section>;
}

export function BillForm({ connection, initial, busy, back, save }: { connection: RentalConnection; initial?: RentalBill; busy: boolean; back: () => void; save: (input: CreateRentalBill) => Promise<void> }) {
  const [draft, setDraft] = useState(() => initial ? { month: initial.month, periodStart: initial.periodStart, periodEnd: initial.periodEnd, dueDate: initial.dueDate, amount: String(initial.amountCents / 100), note: initial.note } : { ...billDefaults(initialBillMonth(connection), connection), note: "" });
  const [confirmed, setConfirmed] = useState(false), [error, setError] = useState("");
  const requestId = useRef(crypto.randomUUID());
  function changeMonth(month: string) { setConfirmed(false); setDraft(previous => isBillingMonth(month) ? { ...previous, ...billDefaults(month, connection) } : { ...previous, month }); }
  function update(key: keyof typeof draft, value: string) { setConfirmed(false); setDraft(previous => ({ ...previous, [key]: value, ...(["periodStart", "periodEnd"].includes(key) ? { amount: "" } : {}) })); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    const amountCents = pesoInputToCents(draft.amount);
    if (amountCents === null) { setError("Enter the agreed rent with no more than two decimal places."); return; }
    const parsed = rentalBillInput.safeParse({ ...draft, amountCents, connectionId: connection.id, requestId: requestId.current, detailsConfirmed: confirmed });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    const periodError = billPeriodError(parsed.data, connection);
    if (periodError) { setError(periodError); return; }
    try { await save(parsed.data); } catch (cause) { setError(errorMessage(cause)); }
  }
  return <form className="rental-form rent-bill-form" onSubmit={submit}>
    <button type="button" className="rent-bill-back text-button" disabled={busy} onClick={back}><ArrowLeft size={15} />Back to rental</button>
    <div className="rent-bill-recipient"><FileText size={24} /><div><p>{connection.propertyName} · {connection.unitName}</p><strong>For {connection.renterName || "your renter"}</strong><span>{connection.renterEmail}</span></div></div>
    <p className="rental-form-intro">Create one rent bill for this billing month. It appears privately in your renter’s Malapit account.</p>
    <fieldset disabled={busy}><div className="form-grid">
      <label className="field"><span>Billing month</span><input type="month" required min={connection.leaseStart.slice(0, 7)} max={connection.leaseEnd?.slice(0, 7) || "2200-12"} value={draft.month} onChange={event => changeMonth(event.target.value)} /><small>The covered period must start in this month.</small></label>
      <label className="field"><span>Rent amount (₱)</span><input type="number" inputMode="decimal" required min="0.01" max="1000000" step="0.01" placeholder="Agreed amount for these dates" value={draft.amount} onChange={event => update("amount", event.target.value)} /><small>Agreed monthly rent: {rentalMoney(connection.monthlyRentCents)}. Check any partial-month amount yourself.</small></label>
      <label className="field"><span>Covered from</span><input type="date" required min={connection.leaseStart} max={connection.leaseEnd || "2200-12-31"} value={draft.periodStart} onChange={event => update("periodStart", event.target.value)} /></label>
      <label className="field"><span>Covered until</span><input type="date" required min={draft.periodStart} max={connection.leaseEnd || "2200-12-31"} value={draft.periodEnd} onChange={event => update("periodEnd", event.target.value)} /></label>
      <label className="field"><span>Payment due date</span><input type="date" required min="1900-01-01" max="2200-12-31" value={draft.dueDate} onChange={event => update("dueDate", event.target.value)} /></label>
      <label className="field full"><span>Note for your renter (optional)</span><textarea rows={3} maxLength={500} value={draft.note} onChange={event => update("note", event.target.value)} placeholder="A short explanation of the agreed rent for these dates" /></label>
    </div><p className="form-help">Dates start with the calendar month. Change them for your agreed rent cycle, up to 31 days. Malapit does not calculate partial-month rent. This bill is for rent only; deposits, utilities and fees are separate.</p>
    <label className="check-row rental-consent"><input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>I checked these dates, rent amount and due date against our agreement. Share this bill with my renter in Malapit.</span></label>
    {error && <p className="form-error" role="alert">{error}</p>}<div className="rental-form-actions"><button className="button primary" type="submit" disabled={!confirmed}>{busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}Create rent bill</button></div></fieldset>
  </form>;
}

export function BillDetail({ detail, userId, busy, back, refresh, cancel, replace, open, recordPayment, reviewPayment, changePaymentPage }: { detail: RentalBillDetail; userId: string; busy: boolean; back: () => void; refresh: () => void; cancel: (reason: string) => Promise<void>; replace: () => void; open: (id: string) => void; recordPayment: (data: CreateRentalPayment) => Promise<void>; reviewPayment: (id: string, action: RentalPaymentAction) => Promise<void>; changePaymentPage: (page: number) => void }) {
  const { bill, connection, events } = detail, owner = bill.ownerId === userId, state = billDateStatus(bill), payment = billPaymentState(bill.amountCents, bill.confirmedCents);
  const [correcting, setCorrecting] = useState(false), [reason, setReason] = useState(""), [error, setError] = useState("");
  const [copied, setCopied] = useState(false), [shareLink, setShareLink] = useState(""), [shareError, setShareError] = useState("");
  useEffect(() => setCopied(false), [bill.id, bill.remainingCents, bill.pendingCents]);
  async function copyBill() {
    const link = window.location.origin + "/?view=rentals&bill=" + bill.id;
    setShareLink(link); setShareError("");
    const message = `Malapit rent bill: ${billMonthLabel(bill.month)}\n${connection.propertyName} · ${connection.unitName}\nRemaining in records: ${rentalMoney(bill.remainingCents)}\nDue: ${rentalDate(bill.dueDate)}${bill.pendingCount ? "\n" + rentalMoney(bill.pendingCents) + " is awaiting owner confirmation." : ""}\nOpen your private bill: ${link}\nPayments are arranged directly using our agreed method.`;
    try { await navigator.clipboard.writeText(owner ? message : link); setCopied(true); }
    catch { setShareError("Select and copy the private bill link below. It opens only for this bill’s owner and renter."); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    const parsed = rentalBillAction.safeParse({ action: "void", confirmed: true, reason });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    try { await cancel(parsed.data.reason); } catch (cause) { setError(errorMessage(cause)); }
  }
  return <div className="rental-connection-detail rent-bill-detail"><button className="rent-bill-back text-button" disabled={busy} onClick={back}><ArrowLeft size={15} />Back to rental</button>
    <div className="rental-detail-status"><span className={"status " + (bill.status === "voided" ? "rent-bill-state-voided" : "bill-payment-" + payment)}>{bill.status === "voided" ? "Cancelled" : billPaymentLabel(payment)}</span><button className="text-button" disabled={busy} onClick={refresh}><RefreshCw size={14} />Refresh bill</button></div>
    <section className="rent-bill-paper"><p className="eyebrow">Rent bill · {billMonthLabel(bill.month)}</p><h3>{rentalMoney(bill.amountCents)}</h3><p>{connection.propertyName} · {connection.unitName}</p><dl><div><dt>Covered from</dt><dd>{rentalDate(bill.periodStart)}</dd></div><div><dt>Covered until</dt><dd>{rentalDate(bill.periodEnd)}</dd></div><div><dt>Payment due</dt><dd>{rentalDate(bill.dueDate)}</dd></div><div><dt>Created</dt><dd>{rentalDate(bill.createdAt)}</dd></div></dl>{bill.note && <div className="rent-bill-note"><strong>Owner’s note</strong><p>{bill.note}</p></div>}</section>
    <PaymentPanel detail={detail} userId={userId} busy={busy} record={recordPayment} act={reviewPayment} changePage={changePaymentPage} />
    {bill.source === "scheduled" && <p className="bill-created-automatically">Created automatically from the monthly billing setup enabled by the owner.</p>}
    {bill.status === "issued" && <div className="bill-share-controls"><button className="text-button" disabled={busy} onClick={() => void copyBill()}>{copied ? "Copied" : owner ? "Copy bill message" : "Copy private bill link"}</button><small className="form-help">Copy and share this message yourself. The renter also gets a bill alert in Malapit.</small></div>}
    {shareError && <label className="field"><span>{shareError}</span><input readOnly value={shareLink} onFocus={event => event.target.select()} /></label>}
    <dl className="rental-people"><div><dt>Owner</dt><dd>{connection.ownerName}<a href={"mailto:" + connection.ownerEmail}>{connection.ownerEmail}</a></dd></div><div><dt>Renter</dt><dd>{connection.renterName}<span>{connection.renterEmail}</span></dd></div></dl>
    {bill.status === "voided" ? <div className="rent-bill-cancelled"><strong>Cancelled for correction</strong><p>{bill.voidReason}</p><small>Cancelled {rentalDate(bill.voidedAt!)}. The original stays in both histories.</small></div> : <><div className="payment-balance-summary"><div><span>Confirmed by owner</span><strong>{rentalMoney(bill.confirmedCents)}</strong></div><div><span>Remaining in records</span><strong>{rentalMoney(bill.remainingCents)}</strong></div></div><p className="form-help">{paymentNote}{bill.remainingCents > 0 ? " " + billDateLabel(state) + "." : ""}</p></>}
    {bill.status === "voided" && <div className="rental-form-actions">{detail.currentBillId ? <button className="button primary" disabled={busy} onClick={() => open(detail.currentBillId!)}>View current bill<ArrowRight size={16} /></button> : owner && connection.status === "accepted" && <button className="button primary" disabled={busy} onClick={replace}>Create corrected bill<ArrowRight size={16} /></button>}</div>}
    {owner && bill.status === "issued" && !bill.confirmedCents && !bill.pendingCount && (correcting ? <form className="rental-action-confirm" onSubmit={submit}><strong>Cancel this bill for correction?</strong><p>The original remains in both histories. This does not record a payment or change your rental agreement. While the connection is open, you can create a corrected bill after cancelling.</p><label className="field"><span>Reason for correction</span><textarea required minLength={5} maxLength={400} rows={3} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} /></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="rental-form-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => setCorrecting(false)}>Keep this bill</button><button className="button primary" disabled={busy} type="submit">Cancel bill</button></div></form> : <div className="rental-detail-secondary"><button className="text-button" disabled={busy} onClick={() => setCorrecting(true)}>Correct this bill</button></div>)}
    <section className="rental-activity"><h3>Bill history</h3>{events.map(event => <div key={event.id}><span>{event.action === "created_automatically" ? "Bill created automatically" : event.action === "created" ? "Bill created" : "Bill cancelled"}<small>{event.actorName}</small>{event.reason && <p>{event.reason}</p>}</span><time dateTime={event.createdAt}>{rentalDate(event.createdAt)}</time></div>)}</section>
  </div>;
}
