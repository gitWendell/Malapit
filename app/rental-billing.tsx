"use client";
import { useState } from "react";
import { CalendarClock, Check, Pause } from "lucide-react";
import { billMonthLabel } from "../lib/rental-bills";
import { scheduleIssueLabel, type RentalBilling } from "../lib/rental-billing";
import { rentalDate, rentalMoney } from "../lib/rentals";

export function AutomaticBills({ billing, owner, amountCents, busy, change }: { billing: RentalBilling; owner: boolean; amountCents: number; busy: boolean; change: (body: unknown) => Promise<void> }) {
  const [editing, setEditing] = useState(false), [checked, setChecked] = useState(false), [error, setError] = useState("");
  const { schedule, preview } = billing, enabled = schedule?.status === "enabled";
  async function save(action: "enable" | "pause") {
    setError("");
    try { await change(action === "enable" ? { action, version: schedule?.version || null, month: preview!.month, detailsConfirmed: checked } : { action, version: schedule!.version, confirmed: true }); setEditing(false); setChecked(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Please try again."); }
  }
  return <section className="automatic-bills" aria-label="Automatic rent bills">
    <div className="automatic-bills-heading"><CalendarClock size={20} /><div><h3>Automatic rent bills</h3><p>{enabled ? `On · Next bill: ${billMonthLabel(schedule.nextMonth)}` : schedule?.status === "attention" ? "Needs your review" : schedule?.status === "finished" ? "Finished" : schedule?.status === "paused" ? "Paused · Future bills are off" : "Optional · Set it up once"}</p></div>{enabled && owner && <button className="button secondary" disabled={busy} onClick={() => void save("pause")}><Pause size={14} />Pause bills</button>}</div>
    {schedule?.issue && <p className="billing-schedule-issue">{scheduleIssueLabel(schedule.issue)}</p>}
    {enabled ? <p className="form-help">A {rentalMoney(amountCents)} rent bill is created at the start of each full calendar month. Both accounts can see it. This does not charge or move money.</p> : owner && preview ? <>
      {!editing ? <button className="text-link" disabled={busy} onClick={() => setEditing(true)}>Set up monthly bills ↗</button> : <div className="billing-schedule-setup"><p>Starting <strong>{billMonthLabel(preview.month)}</strong>, create a rent bill for <strong>{rentalMoney(preview.amountCents)}</strong> each full calendar month.</p><dl><div><dt>First covered period</dt><dd>{rentalDate(preview.periodStart)} – {rentalDate(preview.periodEnd)}</dd></div><div><dt>First due date</dt><dd>{rentalDate(preview.dueDate)}</dd></div></dl><p className="form-help">Use this for an agreed calendar-month rent cycle. Check any partial month manually. You can pause future bills, and closing the connection stops them.</p><label className="check-row rental-consent"><input type="checkbox" disabled={busy} checked={checked} onChange={event => setChecked(event.target.checked)} /><span>I checked the rent, dates and monthly cycle. Create these bills automatically in both Malapit accounts. This does not authorize payment deductions.</span></label><div className="rental-form-actions"><button className="button secondary" disabled={busy} onClick={() => { setEditing(false); setChecked(false); }}>Go back</button><button className="button primary" disabled={busy || !checked} onClick={() => void save("enable")}><Check size={15} />Turn on monthly bills</button></div></div>}
    </> : <p className="form-help">{schedule?.status === "finished" ? "The original bills and payment records remain available." : owner ? "Create partial-month bills manually. An open rental needs a full future calendar month for automatic bills." : "The owner can set up monthly bills after checking your agreed rent cycle."}</p>}
    {schedule?.status === "attention" && owner && <button className="text-button" disabled={busy} onClick={() => void save("pause")}>Keep automatic bills paused</button>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
