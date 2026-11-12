"use client";
import { Bell, CheckCircle2 } from "lucide-react";
import { availabilityDate, AVAILABILITY_DAYS, getAvailability } from "../lib/availability";
import type { Listing } from "../lib/types";

export default function OwnerAvailability({ home, now, busy, onConfirm, onRent, onPause }: { home: Listing; now: number; busy: boolean; onConfirm: () => void; onRent: () => void; onPause: () => void }) {
  const value = getAvailability(home.confirmedAt, now);
  if (home.status !== "published" || home.isDemo) return null;
  const hidden = value.state === "expired" || value.state === "unknown";
  const due = value.state !== "fresh";
  return <section className={`owner-availability availability-${value.state}`} aria-label={`Availability for ${home.title}`}>
    <div className="availability-heading">{due ? <Bell size={17} /> : <CheckCircle2 size={17} />}<strong>{hidden ? "Hidden from search" : value.state === "urgent" ? "Confirmation due soon" : due ? "Still available for rent?" : "Visible in search"}</strong></div>
    <p>{hidden ? "Confirm this rental is still available to show it in search again."
      : due ? `Confirm by ${availabilityDate(value.expires!)} to keep this rental in search.`
      : `Next confirmation is due by ${availabilityDate(value.expires!)}.`}</p>
    {due && <p className="availability-help">Listings are hidden after {AVAILABILITY_DAYS} days without confirmation. If it is no longer available, mark it as rented or pause it.</p>}
    <div className="availability-owner-actions">
      <button className={`button ${due ? "primary" : "secondary"}`} disabled={busy} onClick={onConfirm} aria-label={`Confirm ${home.title} is still available`}><CheckCircle2 size={15} />Yes, still available</button>
      <><button className="text-button" disabled={busy} onClick={onRent} aria-label={`Mark ${home.title} as rented`}>Mark as rented</button><button className="text-button" disabled={busy} onClick={onPause} aria-label={`Pause ${home.title}`}>Pause listing</button></>
    </div>
  </section>;
}
