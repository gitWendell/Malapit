"use client";
import { Clock3 } from "lucide-react";
import { availabilityDate, getAvailability } from "../lib/availability";
import type { Listing } from "../lib/types";

export default function AvailabilityNote({ home, now, compact = false }: { home: Listing; now: number; compact?: boolean }) {
  const value = getAvailability(home.confirmedAt, now);
  const label = home.isDemo ? `Sample confirmation: ${value.relative}`
    : home.status !== "published" ? ({ pending: "Awaiting review", paused: "Listing paused", rented: "Marked as rented", changes_requested: "Listing needs changes" }[home.status])
    : value.state === "unknown" ? "Availability not confirmed"
    : value.state === "expired" ? "Availability confirmation overdue"
    : `Availability confirmed ${value.relative}`;
  return <span className={`availability-note ${compact ? "availability-compact" : ""}`} data-state={home.isDemo ? "sample" : value.state}>
    <Clock3 size={13} aria-hidden="true" />
    {value.confirmed === null ? <span>{label}</span> : <time dateTime={new Date(value.confirmed).toISOString()} title={`${home.isDemo ? "Fictional example date" : "Reported by the lister"}: ${availabilityDate(value.confirmed)}`}>{label}</time>}
  </span>;
}
