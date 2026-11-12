import assert from "node:assert/strict";
import test from "node:test";
import { getAvailability, isListingVisible, needsAvailabilityReminder, availabilityDate } from "../lib/availability.ts";

const now = Date.parse("2026-11-11T08:00:00.000Z");
const home = confirmedAt => ({ status: "published", confirmedAt });
test("a listing stays visible while its first reminder starts at seven elapsed days", () => {
  const before = home("2026-11-04T08:00:00.001Z");
  const due = home("2026-11-04T08:00:00.000Z");
  assert.equal(needsAvailabilityReminder(before, now), false);
  assert.equal(needsAvailabilityReminder(due, now), true);
  assert.equal(isListingVisible(due, now), true);
});
test("the final two days get an urgent reminder", () => {
  assert.equal(getAvailability("2026-10-30T08:00:00.001Z", now).state, "due");
  assert.equal(getAvailability("2026-10-30T08:00:00.000Z", now).state, "urgent");
});
test("visibility ends at exactly fourteen days while the owner still has a reminder", () => {
  assert.equal(isListingVisible(home("2026-10-28T08:00:00.001Z"), now), true);
  const expired = home("2026-10-28T08:00:00.000Z");
  assert.equal(isListingVisible(expired, now), false);
  assert.equal(needsAvailabilityReminder(expired, now), true);
  assert.equal(isListingVisible(home("2026-10-01T08:00:00.000Z"), now), false);
});
test("an owner's reconfirmation restores visibility and clears the reminder", () => {
  const renewed = home(new Date(now).toISOString());
  assert.equal(isListingVisible(renewed, now), true);
  assert.equal(needsAvailabilityReminder(renewed, now), false);
  assert.equal(getAvailability(renewed.confirmedAt, now).expires, Date.parse("2026-11-25T08:00:00.000Z"));
});
test("paused, rented, pending, and correction listings cannot become visible or trigger reminders", () => {
  for (const status of ["paused", "rented", "pending", "changes_requested"]) {
    const item = { status, confirmedAt: "2026-10-01T08:00:00.000Z" };
    assert.equal(isListingVisible(item, now), false);
    assert.equal(needsAvailabilityReminder(item, now), false);
  }
});
test("invalid or far-future confirmations are hidden and require an owner check", () => {
  for (const date of ["", "invalid", "2026-11-12T08:00:00.000Z"]) {
    assert.equal(isListingVisible(home(date), now), false);
    assert.equal(needsAvailabilityReminder(home(date), now), true);
    assert.equal(getAvailability(date, now).confirmed, null);
  }
  assert.equal(isListingVisible(home("2026-11-11T08:01:00.000Z"), now), true);
});
test("fictional examples never create real owner reminders", () => {
  const sample = { ...home("2026-10-01T08:00:00.000Z"), isDemo: true };
  assert.equal(isListingVisible(sample, now), true);
  assert.equal(needsAvailabilityReminder(sample, now), false);
});
test("relative dates follow the Philippine calendar, including midnight", () => {
  const midnight = Date.parse("2026-11-11T16:01:00.000Z");
  assert.equal(getAvailability("2026-11-11T15:59:00.000Z", midnight).relative, "yesterday");
  assert.equal(getAvailability("2026-11-11T16:00:00.000Z", midnight).relative, "today");
  assert.equal(getAvailability("2026-11-09T08:00:00.000Z", now).relative, "2 days ago");
  assert.match(availabilityDate(now), /Nov 11, 2026/);
  assert.match(availabilityDate(now), /4:00/);
  assert.match(availabilityDate(now), /PHT$/);
});
