import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { rentalBillSchedules, rentalConnections } from "../db/schema";
import type { AuthIdentity } from "./auth";
import { getDb, HttpError } from "./server";
import { billScheduleAction, billingPreview, type BillSchedule, type RentalBilling } from "./rental-billing";
import type { RentalConnection } from "./rentals";

// The caller must first check access to this connection's original parties.
export async function billingForConnection(connection: RentalConnection): Promise<RentalBilling> {
  if (!["accepted", "ended"].includes(connection.status)) return { schedule: null, preview: null };
  const [schedule] = await getDb().select().from(rentalBillSchedules).where(eq(rentalBillSchedules.connectionId, connection.id)).limit(1);
  return { schedule: schedule as BillSchedule || null, preview: billingPreview(connection) };
}
export async function changeBillingSchedule(id: string, input: unknown, user: AuthIdentity) {
  if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, "This rental is not available to this account.");
  const db = getDb(), data = billScheduleAction.parse(input);
  const [connection] = await db.select().from(rentalConnections).where(and(eq(rentalConnections.id, id), eq(rentalConnections.ownerId, user.userId))).limit(1);
  if (!connection) throw new HttpError(404, "This rental is not available to this account.");
  const load = async () => (await db.select().from(rentalBillSchedules).where(eq(rentalBillSchedules.connectionId, id)).limit(1))[0];
  const current = await load();
  if (data.action === "pause" && current && ["paused", "finished"].includes(current.status)) return { id };
  if (data.action === "enable" && connection.status === "accepted" && current?.status === "enabled" && current.firstMonth === data.month) return { id };
  if ((current?.version || null) !== data.version) throw new HttpError(409, "This billing schedule changed. Refresh the rental before trying again.");
  const timestamp = new Date(Math.max(Date.now(), Date.parse(current?.updatedAt || "") + 1 || 0)).toISOString();
  if (data.action === "pause") {
    if (!current) throw new HttpError(404, "No automatic billing schedule exists for this rental.");
    const result = await db.update(rentalBillSchedules).set({ status: "paused", issue: "", updatedAt: timestamp, updatedBy: user.userId, version: current.version + 1 }).where(and(eq(rentalBillSchedules.connectionId, id), eq(rentalBillSchedules.version, data.version))).returning({ id: rentalBillSchedules.connectionId });
    if (!result.length) throw new HttpError(409, "The schedule changed. Refresh to check whether a bill was created before pausing.");
  } else {
    const preview = billingPreview(connection as RentalConnection);
    if (!preview) throw new HttpError(409, "Automatic bills need an open rental with a full calendar month remaining. Create any partial-month bill manually.");
    if (preview.month !== data.month) throw new HttpError(409, "The first automatic billing month changed. Refresh and check the new preview.");
    const values = { status: "enabled", firstMonth: preview.month, nextMonth: preview.month, issue: "", updatedAt: timestamp, updatedBy: user.userId };
    if (current) {
      const result = await db.update(rentalBillSchedules).set({ ...values, version: current.version + 1 }).where(and(eq(rentalBillSchedules.connectionId, id), eq(rentalBillSchedules.version, data.version!))).returning({ id: rentalBillSchedules.connectionId });
      if (!result.length) throw new HttpError(409, "This billing schedule changed. Refresh the rental.");
    } else {
      try { await db.insert(rentalBillSchedules).values({ connectionId: id, ownerId: user.userId, ...values, version: 1, createdAt: timestamp }); }
      catch (cause) { const saved = await load(); if (saved?.status !== "enabled" || saved.firstMonth !== data.month) throw cause; }
    }
  }
  return { id };
}
