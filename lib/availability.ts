import type { Listing } from "./types";

export const DAY_MS = 86_400_000;
export const AVAILABILITY_DAYS = 14;
export const REMINDER_AFTER_DAYS = 7;
export const URGENT_AFTER_DAYS = 12;
export const AVAILABILITY_WINDOW_MS = AVAILABILITY_DAYS * DAY_MS;
export type AvailabilityState = "fresh" | "due" | "urgent" | "expired" | "unknown";

const manilaDay = (timestamp: number) => Math.floor((timestamp + 8 * 3_600_000) / DAY_MS);
export function availabilityDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(timestamp) + " PHT";
}

export function getAvailability(confirmedAt: string, now = Date.now()) {
  const confirmed = Date.parse(confirmedAt);
  // A small clock difference is harmless; a missing or implausible date is not a confirmation.
  if (!Number.isFinite(confirmed) || !Number.isFinite(now) || confirmed > now + 300_000) {
    return { state: "unknown" as AvailabilityState, confirmed: null, expires: null, relative: "not confirmed" };
  }
  const age = Math.max(0, now - confirmed), expires = confirmed + AVAILABILITY_WINDOW_MS;
  const days = Math.max(0, manilaDay(now) - manilaDay(confirmed));
  const relative = days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
  const state: AvailabilityState = age >= AVAILABILITY_WINDOW_MS ? "expired" : age >= URGENT_AFTER_DAYS * DAY_MS ? "urgent" : age >= REMINDER_AFTER_DAYS * DAY_MS ? "due" : "fresh";
  return { state, confirmed, expires, relative };
}

export function isListingVisible(home: Pick<Listing, "confirmedAt" | "isDemo"> & { status: string }, now = Date.now()) {
  if (home.status !== "published") return false;
  if (home.isDemo) return true;
  const { state } = getAvailability(home.confirmedAt, now);
  return state !== "expired" && state !== "unknown";
}

export function needsAvailabilityReminder(home: Pick<Listing, "confirmedAt" | "isDemo"> & { status: string }, now = Date.now()) {
  return home.status === "published" && !home.isDemo && getAvailability(home.confirmedAt, now).state !== "fresh";
}
