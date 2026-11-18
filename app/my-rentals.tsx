"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, ArrowRight, CalendarDays, Check, Copy, FileChartColumn, House, KeyRound, LoaderCircle, Mail, Pencil, Plus, RefreshCw, ShieldCheck, Users } from "lucide-react";
import type { Session } from "../lib/types";
import { api, today } from "../lib/client";
import { effectiveRentalStatus, pesoInputToCents, rentalDate, rentalMoney, rentalStatusLabel, rentalUnitInput, type RentalConnection, type RentalEvent, type RentalsData, type RentalUnit } from "../lib/rentals";
import { Empty, Modal } from "./ui";
import { BillDetail, BillForm, BillOverview, BillRows } from "./rental-bills";
import type { RentalBill, RentalBillDetail, RentalBillWithBalance } from "../lib/rental-bills";
import { billMonthLabel } from "../lib/rental-bills";
import type { RentalBilling } from "../lib/rental-billing";
import { AutomaticBills } from "./rental-billing";
import { RentalTasks } from "./rental-workload";
import { PaymentForm } from "./rental-payments";
import { OwnerReports } from "./rental-reports";

type UnitTerms = Omit<RentalUnit, "id" | "ownerId" | "createdAt" | "updatedAt" | "archivedAt">;
type Detail = { connection: RentalConnection; events: RentalEvent[]; bills: RentalBillWithBalance[]; billing: RentalBilling };
type Dialog = { kind: "unit"; unit?: RentalUnit } | { kind: "invite"; unit: RentalUnit } | { kind: "connection"; detail: Detail } | { kind: "bill-form"; connection: RentalConnection; initial?: RentalBill } | { kind: "bill"; detail: RentalBillDetail } | { kind: "payment"; detail: RentalBillDetail };
const message = (error: unknown) => error instanceof Error ? error.message : "Please try again.";

export default function MyRentals({ session, local, onSignIn, notify }: { session: Session; local: boolean; onSignIn: () => void; notify: (text: string, error?: boolean) => void }) {
  const [data, setData] = useState<RentalsData | null>(null), [loadedFor, setLoadedFor] = useState(""), [error, setError] = useState("");
  const [tab, setTab] = useState<"units" | "renting" | "reports">("units"), [archived, setArchived] = useState(false), [busy, setBusy] = useState(false), [dialog, setDialog] = useState<Dialog | null>(null);
  const [billRefreshKey, setBillRefreshKey] = useState(0);
  const [hideLocalControls, setHideLocalControls] = useState(false);
  const sequence = useRef(0), detailSequence = useRef(0), id = session?.userId;
  function selectTab(next: "units" | "renting" | "reports") {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "reports") url.searchParams.set("rentalTab", "reports");
    else url.searchParams.delete("rentalTab");
    url.searchParams.delete("invite"); url.searchParams.delete("bill");
    window.history.replaceState(null, "", url);
  }
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    const result = await api<RentalsData>("/api/rentals", undefined, "GET");
    if (request === sequence.current) { setData(result); setLoadedFor(id || ""); setError(""); setBillRefreshKey(value => value + 1); }
    return result;
  }, [id]);
  const showConnection = useCallback(async (connectionId: string) => {
    const request = ++detailSequence.current;
    setBusy(true);
    try { const detail = await api<Detail>("/api/rentals/connections/" + connectionId, undefined, "GET"); if (request === detailSequence.current) setDialog({ kind: "connection", detail }); }
    catch (cause) { if (request === detailSequence.current) notify(message(cause), true); }
    finally { if (request === detailSequence.current) setBusy(false); }
  }, [notify]);
  const showBill = useCallback(async (billId: string, paymentPage = 0, quick = false) => {
    const request = ++detailSequence.current;
    setBusy(true);
    try { const detail = await api<RentalBillDetail>("/api/rentals/bills/" + billId + "?paymentPage=" + paymentPage, undefined, "GET"); if (request === detailSequence.current) { setTab(previous => detail.bill.ownerId === id ? previous === "reports" ? "reports" : "units" : "renting"); setDialog({ kind: quick && detail.bill.renterId === id && detail.bill.status === "issued" && detail.bill.remainingCents > 0 && !detail.bill.pendingCount ? "payment" : "bill", detail }); } }
    catch (cause) { if (request === detailSequence.current) notify(message(cause), true); }
    finally { if (request === detailSequence.current) setBusy(false); }
  }, [notify, id]);
  useEffect(() => {
    let cancelled = false;
    setData(null); setLoadedFor(""); setDialog(null); setError(""); setBusy(false);
    if (id) refresh().then(result => {
      if (cancelled) return;
      const invitationId = new URLSearchParams(window.location.search).get("invite");
      const billId = new URLSearchParams(window.location.search).get("bill");
      if (invitationId) { setTab("renting"); void showConnection(invitationId); }
      else if (billId) void showBill(billId);
      else if (new URLSearchParams(window.location.search).get("rentalTab") === "reports") setTab("reports");
      else if (!result.units.length && result.myConnections.length) setTab("renting");
    }).catch(cause => { if (!cancelled) setError(message(cause)); });
    return () => { cancelled = true; sequence.current++; detailSequence.current++; };
  }, [id, refresh, showConnection, showBill]);
  useEffect(() => {
    if (!id) return;
    const resume = () => { if (document.visibilityState === "visible") void refresh().catch(cause => setError(message(cause))); };
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => { window.removeEventListener("focus", resume); document.removeEventListener("visibilitychange", resume); };
  }, [id, refresh]);

  async function mutate<T = { id: string }>(path: string, body: unknown, method: string, success: string): Promise<T> {
    setBusy(true);
    try { const result = await api<T>(path, body, method); try { await refresh(); } catch { setError("Your change was saved. Refresh My Rentals to see the latest records."); } notify(success); return result; }
    finally { setBusy(false); }
  }
  async function unitAction(unit: RentalUnit, action: "archive" | "restore") {
    try { await mutate("/api/rentals/units/" + unit.id, { action, version: unit.updatedAt }, "PATCH", action === "archive" ? "Unit archived." : "Unit restored."); }
    catch (cause) { notify(message(cause), true); }
  }
  async function connectionAction(item: RentalConnection, action: "accept" | "decline" | "revoke" | "end") {
    const body = action === "accept" ? { action, detailsConfirmed: true } : { action, confirmed: true };
    await mutate("/api/rentals/connections/" + item.id, body, "PATCH", ({ accept: "You are connected to this rental.", decline: "Invitation declined.", revoke: "Invitation revoked.", end: "Connection closed. Its record stays in your history." })[action]);
    await showConnection(item.id);
  }

  if (!session) return <main className="workspace rentals-workspace"><div className="workspace-title"><div><p className="eyebrow">Your private space</p><h1>My Rentals</h1><p>Keep your unit and agreed rental details together.</p></div></div><Empty title="A place for your rental" description="Sign in with your Malapit account to add a unit or review a renter invitation." action={<button className="button primary" onClick={onSignIn}>Sign in<ArrowRight size={16} /></button>} /></main>;
  const current = loadedFor === id ? data : null;
  const owned = current?.ownedConnections || [], mine = current?.myConnections || [];
  const units = (current?.units || []).filter(unit => archived ? !!unit.archivedAt : !unit.archivedAt);
  const active = owned.filter(item => effectiveRentalStatus(item) === "accepted"), waiting = owned.filter(item => effectiveRentalStatus(item) === "pending");
  const incoming = mine.filter(item => effectiveRentalStatus(item) === "pending"), connected = mine.filter(item => effectiveRentalStatus(item) === "accepted"), past = mine.filter(item => !["pending", "accepted"].includes(effectiveRentalStatus(item)));
  return <main className="workspace rentals-workspace">
    <div className="workspace-title"><div><p className="eyebrow"><KeyRound size={15} />Your private space</p><h1>My Rentals</h1><p>Manage units and connect with the people renting them.</p></div><button className="button primary" disabled={busy} onClick={() => setDialog({ kind: "unit" })}><Plus size={17} />Add a unit</button></div>
    {local && !hideLocalControls && <aside className="rental-local-tools"><strong>Local test accounts</strong><a href="/auth/signin?return_to=/?view=rentals">Owner</a><a href="/auth/signin?test_as=renter&return_to=/?view=rentals">Renter</a><a href="/auth/signin?test_as=other&return_to=/?view=rentals">Other user</a><span>Renter email: local_renter@sites.test</span><button className="text-button" onClick={() => setHideLocalControls(true)}>Hide test controls</button></aside>}
    {local && hideLocalControls && <p className="rental-demo-note">Demonstration · fictional data · no money transferred</p>}
    <div className="rental-toolbar"><div className="rental-tabs" role="group" aria-label="My Rentals view"><button className={tab === "units" ? "selected" : ""} aria-pressed={tab === "units"} onClick={() => selectTab("units")}><House size={16} />My units{current && <span>{current.units.filter(unit => !unit.archivedAt).length}</span>}</button><button className={tab === "renting" ? "selected" : ""} aria-pressed={tab === "renting"} onClick={() => selectTab("renting")}><Users size={16} />I’m renting{incoming.length > 0 && <span>{incoming.length} to check</span>}</button><button className={tab === "reports" ? "selected" : ""} aria-pressed={tab === "reports"} onClick={() => selectTab("reports")}><FileChartColumn size={16} />Reports</button></div><button className="button secondary rental-refresh" disabled={busy} onClick={() => void refresh().catch(cause => setError(message(cause)))} aria-label="Refresh My Rentals"><RefreshCw size={16} /><span>Refresh</span></button></div>
    {error && <div className="rental-load-error" role="alert"><p>{error}</p><button className="text-link" onClick={() => void refresh().catch(cause => setError(message(cause)))}>Try again</button>{error.includes("Sign in") && <button className="text-link" onClick={onSignIn}>Sign in again</button>}</div>}
    {current && tab !== "reports" && <RentalTasks key={"tasks:" + id + ":" + tab} role={tab === "units" ? "owner" : "renter"} refreshKey={billRefreshKey} busy={busy} openBill={billId => void showBill(billId)} report={billId => void showBill(billId, 0, true)} openRental={connectionId => void showConnection(connectionId)} review={async (paymentId, action) => { await mutate("/api/rentals/payments/" + paymentId, action, "PATCH", action.action === "confirm" ? "Receipt confirmed. The renter’s balance is updated." : "Correction requested. The original report stays in the history."); }} />}
    {!current && !error ? <div className="loading-inline"><LoaderCircle className="spin" />Loading your rentals…</div> : current && tab === "units" ? <>
      <div className="stat-grid rental-stats"><div><span>Active units</span><strong>{current.units.filter(unit => !unit.archivedAt).length}</strong></div><div><span>Connected rentals</span><strong>{active.length}</strong></div><div><span>Invitations to accept</span><strong>{waiting.length}</strong></div></div>
      <div className="rental-section-heading"><h2>{archived ? "Archived units" : "Your units"}</h2><label className="rental-archive-toggle"><input type="checkbox" checked={archived} onChange={event => setArchived(event.target.checked)} />Show archived</label></div>
      {units.length ? <div className="rental-unit-grid">{units.map(unit => {
        const history = owned.filter(item => item.unitId === unit.id), live = history.find(item => ["pending", "accepted"].includes(effectiveRentalStatus(item)));
        return <article className="rental-unit-card" key={unit.id}>
          <div className="rental-unit-top"><span className="rental-house-icon"><House size={22} /></span><span className={"status rental-state-" + (unit.archivedAt ? "archived" : live ? effectiveRentalStatus(live) : "empty")}>{unit.archivedAt ? "Archived" : live ? rentalStatusLabel(effectiveRentalStatus(live)) : "Ready to connect"}</span></div>
          <p className="rental-property-name">{unit.propertyName}</p><h3>{unit.unitName}</h3><p className="rental-unit-address">{unit.address}, {unit.city}</p><div className="rental-unit-rent"><strong>{rentalMoney(unit.monthlyRentCents)}</strong><span>/ month</span></div><p className="rental-unit-due"><CalendarDays size={14} />Rent due on day {unit.dueDay}</p>
          {live && <div className="rental-connected-person"><Users size={16} /><span>{live.renterName || live.inviteEmail}<small>{effectiveRentalStatus(live) === "accepted" ? "Connected renter" : "Invited renter"}</small></span></div>}
          <div className="rental-card-actions">{unit.archivedAt ? <button className="button secondary" disabled={busy} onClick={() => void unitAction(unit, "restore")}><RefreshCw size={14} />Restore</button> : live ? <button className="button primary" disabled={busy} onClick={() => void showConnection(live.id)}>{live.status === "accepted" ? "View rental" : "View invitation"}<ArrowRight size={14} /></button> : <><button className="button primary" disabled={busy} onClick={() => setDialog({ kind: "invite", unit })}><Mail size={14} />Invite renter</button><button className="button secondary" disabled={busy} onClick={() => setDialog({ kind: "unit", unit })}><Pencil size={14} />Edit</button><button className="rental-icon-action" disabled={busy} onClick={() => void unitAction(unit, "archive")} aria-label={"Archive " + unit.unitName}><Archive size={17} /></button></>}</div>
          {history.length > 0 && <details className="rental-history"><summary>Connection history ({history.length})</summary>{history.map(item => <button key={item.id} disabled={busy} onClick={() => void showConnection(item.id)}><span>{item.renterName || item.inviteEmail}<small>{rentalDate(item.createdAt)}</small></span><span>{rentalStatusLabel(effectiveRentalStatus(item))}</span></button>)}</details>}
        </article>;
      })}</div> : <Empty title={archived ? "No archived units" : "Start with a place you manage"} description={archived ? "Units you archive will appear here." : "Add your unit or room, set the agreed rent, and invite an existing renter. Adding a private unit does not advertise it on the map."} action={!archived && <button className="button primary" onClick={() => setDialog({ kind: "unit" })}><Plus size={16} />Add your first unit</button>} />}
    </> : current && tab === "renting" ? <>
      {incoming.length > 0 && <section className="rental-incoming"><div className="rental-section-heading"><h2>Invitations to check</h2><span>{incoming.length}</span></div><div className="rental-unit-grid">{incoming.map(item => <ConnectionCard key={item.id} item={item} busy={busy} open={() => void showConnection(item.id)} />)}</div></section>}
      <div className="rental-section-heading"><h2>Your connected rentals</h2></div>
      {connected.length ? <div className="rental-unit-grid">{connected.map(item => <ConnectionCard key={item.id} item={item} busy={busy} open={() => void showConnection(item.id)} />)}</div> : <Empty title={incoming.length ? "Check the invitation above" : "Your rental connection starts here"} description={incoming.length ? "Review the owner, unit and rental details before accepting." : "Ask your owner to invite the email you use to sign in to Malapit. Their invitation will appear here."} />}
      {past.length > 0 && <details className="rental-past"><summary>Past connections and responses ({past.length})</summary><div className="rental-unit-grid">{past.map(item => <ConnectionCard key={item.id} item={item} busy={busy} open={() => void showConnection(item.id)} />)}</div></details>}
    </> : null}
    {current && tab === "reports" && <OwnerReports key={id} refreshKey={billRefreshKey} busy={busy} openUnits={() => selectTab("units")} />}
    {current && tab !== "reports" && <BillOverview key={id + ":" + tab} role={tab === "units" ? "owner" : "renter"} refreshKey={billRefreshKey} busy={busy} open={billId => void showBill(billId)} />}
    <p className="rental-private-note"><ShieldCheck size={15} />Rental records are private to their owner and connected renter. Payments are arranged directly between you.</p>
    {dialog && current && <Modal title={dialog.kind === "unit" ? dialog.unit ? "Edit unit" : "Add a private unit" : dialog.kind === "invite" ? "Invite your renter" : dialog.kind === "bill-form" ? "Create rent bill" : dialog.kind === "payment" ? "Report a payment" : dialog.kind === "bill" ? "Rent bill" : "Rental connection"} wide={dialog.kind === "unit" || dialog.kind === "bill-form"} className="rental-dialog" onClose={() => { if (!busy) setDialog(null); }}>
      {dialog.kind === "unit" ? <UnitForm key={dialog.unit?.id || "new"} initial={dialog.unit} busy={busy} onSave={async terms => { if (dialog.unit) await mutate("/api/rentals/units/" + dialog.unit.id, { action: "update", version: dialog.unit.updatedAt, data: terms }, "PATCH", "Unit details updated."); else await mutate("/api/rentals/units", terms, "POST", "Your private unit is ready. You can invite your renter."); setDialog(null); }} />
        : dialog.kind === "invite" ? <InviteForm unit={dialog.unit} email={session.email} busy={busy} onInvite={async email => { const result = await mutate<{ id: string }>("/api/rentals/invitations", { unitId: dialog.unit.id, unitVersion: dialog.unit.updatedAt, email, sharingConfirmed: true }, "POST", "Invitation ready. Share the link with your renter."); setDialog(null); await showConnection(result.id); }} />
        : dialog.kind === "bill-form" ? <BillForm key={dialog.connection.id} connection={dialog.connection} initial={dialog.initial} busy={busy} back={() => void showConnection(dialog.connection.id)} save={async input => { const result = await mutate<{ id: string }>("/api/rentals/bills", input, "POST", "Rent bill shared in My Rentals."); await showBill(result.id); }} />
        : dialog.kind === "payment" ? <div className="quick-payment-dialog"><p className="eyebrow">{dialog.detail.connection.propertyName} · {dialog.detail.connection.unitName}</p><h3>Rent for {billMonthLabel(dialog.detail.bill.month)}</h3><PaymentForm key={dialog.detail.bill.id} owner={false} remainingCents={dialog.detail.bill.remainingCents} defaultMethod={dialog.detail.defaultPaymentMethod} busy={busy} back={() => void showBill(dialog.detail.bill.id)} save={async input => { await mutate("/api/rentals/bills/" + dialog.detail.bill.id + "/payments", input, "POST", "Payment reported. The owner can check it in their review list."); setDialog(null); }} /></div>
        : dialog.kind === "bill" ? <BillDetail key={dialog.detail.bill.id + dialog.detail.bill.status} detail={dialog.detail} userId={session.userId} busy={busy} back={() => void showConnection(dialog.detail.bill.connectionId)} refresh={() => void showBill(dialog.detail.bill.id, dialog.detail.paymentPage)} cancel={async reason => { await mutate("/api/rentals/bills/" + dialog.detail.bill.id, { action: "void", reason, confirmed: true }, "PATCH", "Bill cancelled for correction. Its original stays in the history."); await showBill(dialog.detail.bill.id); }} replace={() => setDialog({ kind: "bill-form", connection: dialog.detail.connection, initial: dialog.detail.bill })} open={billId => void showBill(billId)} recordPayment={async input => { await mutate("/api/rentals/bills/" + dialog.detail.bill.id + "/payments", input, "POST", input.receiptConfirmed ? "Received payment recorded. The balance is updated." : "Payment reported. It is awaiting owner confirmation."); await showBill(dialog.detail.bill.id); }} reviewPayment={async (paymentId, action) => { await mutate("/api/rentals/payments/" + paymentId, action, "PATCH", ({ confirm: "Receipt confirmed by owner. The balance is updated.", reject: "Correction requested. The renter can submit a new report.", cancel: "Your report was cancelled. Its history is kept.", reverse: "Payment record reversed. Its history is kept; no money was moved." })[action.action]); await showBill(dialog.detail.bill.id); }} changePaymentPage={page => void showBill(dialog.detail.bill.id, page)} />
        : <ConnectionDetail key={dialog.detail.connection.id + dialog.detail.connection.status + ":" + dialog.detail.billing.schedule?.version} detail={dialog.detail} session={session} busy={busy} onAction={action => connectionAction(dialog.detail.connection, action)} onCreateBill={() => setDialog({ kind: "bill-form", connection: dialog.detail.connection })} onOpenBill={billId => void showBill(billId)} onBilling={async body => { await mutate("/api/rentals/connections/" + dialog.detail.connection.id + "/billing", body, "PATCH", (body as { action: string }).action === "enable" ? "Monthly bills are on. The first automatic month is shown in this rental." : "Automatic bills paused."); await showConnection(dialog.detail.connection.id); }} />}
    </Modal>}
  </main>;
}

function ConnectionCard({ item, busy, open }: { item: RentalConnection; busy: boolean; open: () => void }) {
  const status = effectiveRentalStatus(item);
  return <article className="rental-unit-card"><div className="rental-unit-top"><span className="rental-house-icon"><KeyRound size={22} /></span><span className={"status rental-state-" + status}>{rentalStatusLabel(status)}</span></div><p className="rental-property-name">{item.propertyName}</p><h3>{item.unitName}</h3><p className="rental-unit-address">{item.address}, {item.city}</p><div className="rental-unit-rent"><strong>{rentalMoney(item.monthlyRentCents)}</strong><span>/ month</span></div><p className="rental-unit-due"><Users size={14} />{item.ownerName}</p><div className="rental-card-actions"><button className="button primary" disabled={busy} onClick={open}>{status === "pending" ? "Review invitation" : "View rental details"}<ArrowRight size={15} /></button></div></article>;
}

function UnitForm({ initial, busy, onSave }: { initial?: RentalUnit; busy: boolean; onSave: (terms: UnitTerms & { requestId?: string }) => Promise<void> }) {
  const [draft, setDraft] = useState({ propertyName: initial?.propertyName || "", unitName: initial?.unitName || "", city: initial?.city || "", address: initial?.address || "", monthlyRent: initial ? String(initial.monthlyRentCents / 100) : "", dueDay: String(initial?.dueDay || 1), leaseStart: initial?.leaseStart || today(), leaseEnd: initial?.leaseEnd || "" });
  const [error, setError] = useState("");
  const requestId = useRef(crypto.randomUUID());
  const update = (key: keyof typeof draft, value: string) => setDraft(previous => ({ ...previous, [key]: value }));
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    const cents = pesoInputToCents(draft.monthlyRent);
    if (cents === null) { setError("Enter the monthly rent with no more than two decimal places."); return; }
    const parsed = rentalUnitInput.safeParse({ ...draft, monthlyRentCents: cents, dueDay: Number(draft.dueDay), leaseEnd: draft.leaseEnd || null });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    try { await onSave({ ...parsed.data, requestId: requestId.current }); } catch (cause) { setError(message(cause)); }
  }
  return <form className="rental-form" onSubmit={submit}><p className="rental-form-intro">A private record for a place you manage. You can invite a renter after saving.</p><fieldset disabled={busy}><div className="form-grid">
    <label className="field"><span>Property name</span><input value={draft.propertyName} onChange={event => update("propertyName", event.target.value)} required minLength={2} maxLength={100} placeholder="e.g. Sampaguita Apartments" /></label>
    <label className="field"><span>Unit / room</span><input value={draft.unitName} onChange={event => update("unitName", event.target.value)} required maxLength={60} placeholder="e.g. Unit 2B" /></label>
    <label className="field"><span>City or municipality</span><input value={draft.city} onChange={event => update("city", event.target.value)} required minLength={2} maxLength={80} placeholder="City or municipality" /></label>
    <label className="field"><span>Monthly rent (₱)</span><input type="number" min={100} max={1000000} step=".01" value={draft.monthlyRent} onChange={event => update("monthlyRent", event.target.value)} required placeholder="e.g. 8000" /></label>
    <label className="field full"><span>Unit address</span><input value={draft.address} onChange={event => update("address", event.target.value)} required minLength={8} maxLength={250} placeholder="Building, street and barangay" /></label>
    <label className="field"><span>Rent due day</span><select value={draft.dueDay} onChange={event => update("dueDay", event.target.value)}>{Array.from({ length: 31 }, (_, index) => <option key={index + 1} value={index + 1}>Day {index + 1} of each month</option>)}</select>{Number(draft.dueDay) > 28 && <small>In shorter months, use the last day of the month.</small>}</label>
    <label className="field"><span>Rental start</span><input type="date" required min="1900-01-01" max="2200-12-31" value={draft.leaseStart} onChange={event => update("leaseStart", event.target.value)} /></label>
    <label className="field"><span>Rental end (optional)</span><input type="date" min={draft.leaseStart} max="2200-12-31" value={draft.leaseEnd} onChange={event => update("leaseEnd", event.target.value)} /><small>Leave empty for an open-ended rental.</small></label>
  </div><p className="form-help">Record the rent and dates agreed with your renter. Deposits, utilities and rent collection are separate.</p>{error && <p className="form-error" role="alert">{error}</p>}<div className="rental-form-actions"><button className="button primary" type="submit">{busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}{initial ? "Save unit" : "Add unit"}</button></div></fieldset></form>;
}

function RentalTerms({ item }: { item: Pick<RentalUnit, "propertyName" | "unitName" | "address" | "city" | "monthlyRentCents" | "dueDay" | "leaseStart" | "leaseEnd"> }) {
  return <section className="rental-terms"><p className="rental-property-name">{item.propertyName}</p><h3>{item.unitName}</h3><p className="rental-unit-address">{item.address}, {item.city}</p><dl><div><dt>Monthly rent</dt><dd>{rentalMoney(item.monthlyRentCents)}</dd></div><div><dt>Rent due</dt><dd>Day {item.dueDay} each month{item.dueDay > 28 && <small>Last day in shorter months</small>}</dd></div><div><dt>Rental start</dt><dd>{rentalDate(item.leaseStart)}</dd></div><div><dt>Rental end</dt><dd>{item.leaseEnd ? rentalDate(item.leaseEnd) : "Open-ended"}</dd></div></dl></section>;
}

function InviteForm({ unit, email, busy, onInvite }: { unit: RentalUnit; email: string; busy: boolean; onInvite: (email: string) => Promise<void> }) {
  const [renterEmail, setRenterEmail] = useState(""), [confirmed, setConfirmed] = useState(false), [error, setError] = useState("");
  async function submit(event: React.FormEvent) { event.preventDefault(); setError(""); try { await onInvite(renterEmail.trim()); } catch (cause) { setError(message(cause)); } }
  return <form className="rental-form" onSubmit={submit}><RentalTerms item={unit} /><fieldset disabled={busy}><label className="field"><span>Renter’s Malapit sign-in email</span><input type="email" autoComplete="off" required maxLength={254} value={renterEmail} onChange={event => setRenterEmail(event.target.value)} placeholder="Their Google account email" /></label><p className="form-help">The invitation will appear in their My Rentals area. You can also share its link. It expires after 7 days.</p><label className="check-row rental-consent"><input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>I manage this unit and can share these details with the renter. My account name and email ({email}) will be visible to them.</span></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="rental-form-actions"><button className="button primary" disabled={!confirmed} type="submit">{busy ? <LoaderCircle className="spin" size={17} /> : <Mail size={17} />}Create invitation</button></div></fieldset></form>;
}

function ConnectionDetail({ detail, session, busy, onAction, onCreateBill, onOpenBill, onBilling }: { detail: Detail; session: NonNullable<Session>; busy: boolean; onAction: (action: "accept" | "decline" | "revoke" | "end") => Promise<void>; onCreateBill: () => void; onOpenBill: (id: string) => void; onBilling: (body: unknown) => Promise<void> }) {
  const item = detail.connection, owner = item.ownerId === session.userId, status = effectiveRentalStatus(item);
  const [checked, setChecked] = useState(false), [error, setError] = useState(""), [confirmAction, setConfirmAction] = useState<"revoke" | "end" | null>(null), [copied, setCopied] = useState(false);
  const linkInput = useRef<HTMLInputElement>(null);
  const link = typeof window === "undefined" ? "" : window.location.origin + "/?view=rentals&invite=" + item.id;
  async function action(value: "accept" | "decline" | "revoke" | "end") { setError(""); try { await onAction(value); } catch (cause) { setError(message(cause)); } }
  async function copy() { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { linkInput.current?.focus(); linkInput.current?.select(); setError("Select and copy the link above to share it."); } }
  return <div className="rental-connection-detail"><div className="rental-detail-status"><span className={"status rental-state-" + status}>{rentalStatusLabel(status)}</span><span>{owner ? "Owner view" : "Renter view"}</span></div><RentalTerms item={item} />
    <dl className="rental-people"><div><dt>Owner</dt><dd>{item.ownerName}<a href={"mailto:" + item.ownerEmail}>{item.ownerEmail}</a></dd></div><div><dt>{status === "pending" ? "Invited renter" : "Renter"}</dt><dd>{item.renterName || item.inviteEmail}{item.renterEmail && <span>{item.renterEmail}</span>}</dd></div></dl>
    {status === "pending" && <p className="form-help">Invitation valid until {rentalDate(item.expiresAt)}. Check the owner, unit, rent and dates before accepting.</p>}
    {status === "pending" && owner && <section className="rental-share"><label className="field"><span>Share this invitation link</span><input ref={linkInput} readOnly value={link} onFocus={event => event.target.select()} /></label><button className="button secondary" onClick={() => void copy()}><Copy size={15} />{copied ? "Copied" : "Copy link"}</button><p className="form-help">Only {item.inviteEmail} can open it after signing in. Share the link yourself; Malapit does not send an email.</p></section>}
    {status === "pending" && !owner && <><label className="check-row rental-consent"><input type="checkbox" checked={checked} disabled={busy} onChange={event => setChecked(event.target.checked)} /><span>I checked these rental details. Accepting shares my account name and email ({session.email}) with the owner and connects this private record.</span></label><p className="form-help">Accepting or declining records your account name and email for the owner. This connection does not sign a lease or authorize payments.</p><div className="rental-form-actions"><button className="button secondary" disabled={busy} onClick={() => void action("decline")}>Decline invitation</button><button className="button primary" disabled={busy || !checked} onClick={() => void action("accept")}><Check size={16} />Accept connection</button></div></>}
    {(status === "accepted" || status === "ended") && <p className="rental-record-note"><ShieldCheck size={17} />{status === "accepted" ? "You are connected through this private Malapit record. Your rental agreement and payments stay between you and the other party." : "This connection is closed. Its original record stays visible to the original owner and renter."}</p>}
    {(status === "accepted" || status === "ended") && <AutomaticBills billing={detail.billing} owner={owner} amountCents={item.monthlyRentCents} busy={busy} change={onBilling} />}
    {(status === "accepted" || status === "ended") && <section className="rental-connection-bills"><div className="rental-section-heading"><h3>Latest rent bills</h3>{owner && status === "accepted" && <button className="button primary" disabled={busy} onClick={onCreateBill}><Plus size={15} />Create rent bill</button>}</div>{detail.bills?.length ? <BillRows bills={detail.bills} busy={busy} open={onOpenBill} /> : <p className="form-help">{owner && status === "accepted" ? "Create this month’s bill manually, or set up automatic bills for future full months." : "No rent bills have been created for this connection."}</p>}<p className="form-help">Older bills can be found using the billing month in My Rentals.</p></section>}
    {confirmAction ? <div className="rental-action-confirm"><strong>{confirmAction === "revoke" ? "Revoke this invitation?" : "Close this Malapit connection?"}</strong><p>{confirmAction === "revoke" ? "The renter will no longer be able to accept this link. You can prepare another invitation later." : "This closes the shared record in My Rentals. It does not terminate your rental agreement or remove the record from your history."}</p><div className="rental-form-actions"><button className="button secondary" disabled={busy} onClick={() => setConfirmAction(null)}>Keep it open</button><button className="button primary" disabled={busy} onClick={() => void action(confirmAction)}>{confirmAction === "revoke" ? "Revoke invitation" : "Close connection"}</button></div></div> : <div className="rental-detail-secondary">{status === "pending" && owner && <button className="text-button" disabled={busy} onClick={() => setConfirmAction("revoke")}>Revoke invitation</button>}{status === "accepted" && <button className="text-button" disabled={busy} onClick={() => setConfirmAction("end")}>Close connection</button>}</div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <section className="rental-activity"><h3>Record history</h3>{detail.events.map(event => <div key={event.id}><span>{({ invited: "Invitation prepared", accepted: "Renter accepted", declined: "Renter declined", revoked: "Invitation revoked", expired: "Invitation expired", ended: "Connection closed", billing_enabled: "Automatic bills turned on", billing_paused: "Automatic bills paused", billing_attention: "Automatic bills need review", billing_finished: "Automatic bills stopped" } as Record<string, string>)[event.action] || event.action}<small>{event.actorName}</small></span><time dateTime={event.createdAt}>{rentalDate(event.createdAt)}</time></div>)}</section>
  </div>;
}
