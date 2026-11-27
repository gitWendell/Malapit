"use client";
import { useEffect, useRef, useState } from "react";
import { House, LoaderCircle } from "lucide-react";
import type { Inquiry } from "../lib/types";
import { api } from "../lib/client";
import { pesoInputToCents } from "../lib/rentals";
import { firstRentPeriod, inquiryRentalInput, type InquiryRentalSetup } from "../lib/inquiry-rentals";
import { monthBounds } from "../lib/rental-bills";
import InquiryViewings from "./inquiry-viewings";
import { inquiryNextStep } from "../lib/inquiry-next-step";
import type { InquiryViewing } from "../lib/inquiry-viewings";
import { Modal } from "./ui";

const message = (error: unknown) => error instanceof Error ? error.message : "Please try again.";
const formatAmount = (value: string) => { const [whole, fraction] = value.split("."); return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (fraction === undefined ? "" : "." + fraction); };
function MoneyField({ label, value, change, help }: { label: string; value: string; change: (value: string) => void; help?: string }) {
  return <label className="field"><span>{label}</span><input type="text" inputMode="decimal" required value={formatAmount(value)} placeholder="e.g. 8,000" onChange={event => { const next = event.target.value.replaceAll(",", ""); if (/^\d*(\.\d{0,2})?$/.test(next)) change(next.replace(/^0+(?=\d)/, "")); }} />{help && <small>{help}</small>}</label>;
}
export default function InquiryRentalAction({ item, userId, refresh }: { item: Inquiry; userId: string; refresh: () => Promise<void> }) {
  const [setup, setSetup] = useState<InquiryRentalSetup | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [viewing, setViewing] = useState<InquiryViewing | null>(item.viewing || null);
  useEffect(() => { setViewing(item.viewing || null); }, [item.viewing?.id, item.viewing?.version]);
  const owner = item.ownerId === userId;
  if (item.isDemo || !owner && item.renterId !== userId) return null;
  const rental = item.rental, next = inquiryNextStep({ ...item, viewing }, userId)!;
  const live = next.hasRental;
  const steps = ["Inquiry sent", "Viewing (optional)", "Rental details", "Rent bill"];
  async function open() { setBusy(true); setError(""); try { setSetup(await api<InquiryRentalSetup>(`/api/inquiries/${item.id}/rental`, undefined, "GET")); } catch (cause) { setError(message(cause)); } finally { setBusy(false); } }
  return <section className="inquiry-rental-next" aria-label={`Rental and payment for ${item.listingTitle}`}>
    <ol className="rental-progress" aria-label="Steps to rent this place">{steps.map((label, index) => {
      const optional = index === 1 && next.stage >= 2 && viewing?.status !== "completed";
      const state = optional ? "optional" : index < next.stage ? "done" : index === next.stage ? "current" : "upcoming";
      return <li key={label} className={state} aria-current={state === "current" ? "step" : undefined}><span aria-hidden="true">{state === "done" ? "✓" : index + 1}</span><strong>{label}</strong>{optional && <small>Not recorded</small>}</li>;
    })}</ol>
    <div className="inquiry-next-heading"><strong>{next.title}</strong><p>{next.description}</p></div>
    <InquiryViewings item={item} userId={userId} viewing={viewing} locked={live || !!next.viewingsClosed} updated={setViewing} refresh={refresh} />
    {live ? <a className="button primary" href={rental?.status === "pending" || !rental?.billId ? `/?view=rentals&invite=${rental?.connectionId}` : `/?view=rentals&bill=${rental.billId}`}>{next.rentalAction}</a> : next.viewingsClosed ? <a className="button primary" href="/?view=explore">Find another place</a> : owner && <div className="inquiry-rental-setup"><p>{viewing?.status === "completed" ? "Ready to send the terms you agreed?" : "Already agreed to rent? You can skip the viewing."}</p><button className={`button ${viewing?.status === "completed" ? "primary" : "secondary"}`} disabled={busy} onClick={() => void open()}>{busy ? <LoaderCircle size={17} className="spin" /> : <House size={17} />}Set up rental</button></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {setup && <Modal title="Set up this rental" className="rental-handoff-dialog" wide onClose={() => { if (!busy) setSetup(null); }}><SetupForm setup={setup} item={item} busy={busy} save={async input => { setBusy(true); try { const result = await api<{ id: string }>(`/api/inquiries/${item.id}/rental`, input); await refresh().catch(() => {}); window.location.assign(`/?view=rentals&invite=${result.id}`); } finally { setBusy(false); } }} /></Modal>}
  </section>;
}
function SetupForm({ setup, item, busy, save }: { setup: InquiryRentalSetup; item: Inquiry; busy: boolean; save: (input: unknown) => Promise<void> }) {
  const [terms, setTerms] = useState(setup.terms), [rent, setRent] = useState(String(setup.terms.monthlyRentCents / 100));
  const [bill, setBill] = useState(setup.firstBill), [amount, setAmount] = useState(setup.terms.leaseStart.endsWith("-01") && setup.firstBill.periodEnd === monthBounds(setup.firstBill.month).last ? String(setup.firstBill.amountCents / 100) : "");
  const [checked, setChecked] = useState(false), [error, setError] = useState(""); const requestId = useRef(crypto.randomUUID());
  function dates(start: string, end: string | null) { setChecked(false); setTerms(previous => ({ ...previous, leaseStart: start, leaseEnd: end })); if (/^\d{4}-\d{2}-\d{2}$/.test(start)) { try { setBill(previous => ({ ...previous, month: start.slice(0,7), ...firstRentPeriod(start,end), dueDate: start })); } catch {} } setAmount(""); }
  async function submit(event: React.FormEvent) { event.preventDefault(); setError(""); const parsed = inquiryRentalInput.safeParse({ requestId: requestId.current, terms: { ...terms, monthlyRentCents: pesoInputToCents(rent) }, firstBill: { ...bill, amountCents: pesoInputToCents(amount) }, sharingConfirmed: checked }); if (!parsed.success) { setError(parsed.error.issues[0].message); return; } try { await save(parsed.data); } catch (cause) { setError(message(cause)); } }
  return <form className="rental-form inquiry-setup-form" onSubmit={submit}>
    <div className="handoff-recipient"><strong>{item.listingTitle}</strong><p>For {setup.renterName} · account from this inquiry</p></div>
    <p className="rental-form-intro">Send the rent and dates you both agreed on. When the renter accepts, this place appears in My Rentals, the first bill opens, and the map listing is marked rented.</p>
    <fieldset disabled={busy}><div className="form-grid">
      <MoneyField label="Monthly rent (₱)" value={rent} change={value => { setRent(value); setChecked(false); }} />
      <label className="field"><span>Rent due day each month</span><select value={terms.dueDay} onChange={event => { setTerms(previous => ({ ...previous, dueDay: Number(event.target.value) })); setChecked(false); }}>{Array.from({length:31},(_,index) => <option key={index+1} value={index+1}>Day {index+1}</option>)}</select></label>
      <label className="field"><span>Rental starts</span><input type="date" required value={terms.leaseStart} min="1900-01-01" max="2200-12-31" onChange={event => dates(event.target.value,terms.leaseEnd)} /></label>
      <label className="field"><span>Rental ends (optional)</span><input type="date" value={terms.leaseEnd || ""} min={terms.leaseStart} max="2200-12-31" onChange={event => dates(terms.leaseStart,event.target.value || null)} /></label>
    </div><details className="handoff-property-details"><summary>Check property details</summary><div className="form-grid">{([['propertyName','Property name'],['unitName','Unit or room'],['city','City or municipality'],['address','Private rental address']] as const).map(([key,label]) => <label key={key} className="field"><span>{label}</span><input required value={terms[key]} maxLength={key==='address'?250:key==='propertyName'?100:key==='unitName'?60:80} onChange={event => { setTerms(previous => ({ ...previous,[key]:event.target.value })); setChecked(false); }} /></label>)}</div></details>
    <section className="handoff-first-bill"><h3>First rent bill</h3><p>The renter sees this bill before accepting. Rent only; deposits, utilities and fees are separate.</p><div className="form-grid">
      <MoneyField label="First bill amount (₱)" value={amount} change={value => { setAmount(value); setChecked(false); }} help="Enter the amount you agreed for these dates. Partial months are not calculated automatically." />
      <label className="field"><span>First payment due</span><input type="date" required min="1900-01-01" max="2200-12-31" value={bill.dueDate} onChange={event => { setBill(previous => ({ ...previous, dueDate:event.target.value })); setChecked(false); }} /></label>
      <label className="field"><span>Bill covers from</span><input type="date" readOnly value={terms.leaseStart} /><small>Matches the rental start date.</small></label>
      <label className="field"><span>Bill covers until</span><input type="date" required min={terms.leaseStart} max={terms.leaseEnd || "2200-12-31"} value={bill.periodEnd} onChange={event => { setBill(previous => ({ ...previous, periodEnd:event.target.value })); setAmount(""); setChecked(false); }} /></label>
      <label className="field full"><span>Note or direct-payment instructions (optional)</span><textarea placeholder="Explain the agreed payment method. These details are private to this rental." maxLength={500} rows={2} value={bill.note} onChange={event => { setBill(previous => ({ ...previous,note:event.target.value })); setChecked(false); }} /></label>
    </div></section>
    <label className="check-row rental-consent"><input type="checkbox" required checked={checked} onChange={event => setChecked(event.target.checked)} /><span>I manage this property and checked the rent, dates and first bill. Share these details and my account name and email with this renter.</span></label>
    <p className="form-help">The renter must accept first. This does not sign a lease or charge anyone. Payments are made directly to the owner and recorded in Malapit.</p>
    {error && <p className="form-error" role="alert">{error}</p>}<div className="rental-form-actions"><button className="button primary" disabled={!checked} type="submit">{busy ? <LoaderCircle className="spin" size={17} /> : <House size={17} />}Send rental details</button></div></fieldset>
  </form>;
}
