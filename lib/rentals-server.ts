import { env } from "cloudflare:workers";
import { and, desc, eq, getTableColumns, gt, isNull, ne, or } from "drizzle-orm";
import { rentalBills, rentalConnections, rentalEvents, rentalUnits } from "../db/schema";
import { getDb, HttpError, routeError } from "./server";
import type { AuthIdentity } from "./auth";
import { effectiveRentalStatus, normalizeRentalEmail, philippinesDay, RENTAL_LIMITS, rentalConnectionAction, rentalCreateRequest, rentalInviteInput, rentalUnitAction, rentalUnitInput, type RentalConnection, type RentalsData } from "./rentals";
import { billBalanceColumns } from "./rental-payment-queries";
import { billingForConnection } from "./rental-billing-server";

const unavailable = () => new HttpError(404, "This rental record is not available to this account.");
function database() { if (!env.DB) throw new HttpError(503, "My Rentals is temporarily unavailable."); return env.DB; }
function validId(id: string) { if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id)) throw unavailable(); }
function versionAfter(previous: string) { return new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString(); }
const connection = (row: typeof rentalConnections.$inferSelect): RentalConnection => ({ ...row, status: effectiveRentalStatus(row as RentalConnection) });

export async function rentalJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new HttpError(415, "Please send the form as JSON.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Please complete the form.");
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const part = await reader.read(); if (part.done) break;
    length += part.value.byteLength;
    if (length > 8192) { await reader.cancel(); throw new HttpError(413, "This form is too large."); }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function rentalsFor(user: AuthIdentity): Promise<RentalsData> {
  const db = getDb(), now = new Date().toISOString();
  const [units, owned, mine] = await Promise.all([
    db.select().from(rentalUnits).where(eq(rentalUnits.ownerId, user.userId)).orderBy(desc(isNull(rentalUnits.archivedAt)), desc(rentalUnits.createdAt)).limit(100),
    db.select().from(rentalConnections).where(eq(rentalConnections.ownerId, user.userId)).orderBy(desc(eq(rentalConnections.status, "accepted")), desc(and(eq(rentalConnections.status, "pending"), gt(rentalConnections.expiresAt, now))!), desc(rentalConnections.createdAt)).limit(200),
    db.select().from(rentalConnections).where(or(
      eq(rentalConnections.renterId, user.userId),
      and(eq(rentalConnections.status, "pending"), eq(rentalConnections.inviteEmail, normalizeRentalEmail(user.email)), gt(rentalConnections.expiresAt, now), ne(rentalConnections.ownerId, user.userId)),
    )).orderBy(desc(eq(rentalConnections.status, "accepted")), desc(eq(rentalConnections.status, "pending")), desc(rentalConnections.createdAt)).limit(100),
  ]);
  return { units, ownedConnections: owned.map(connection), myConnections: mine.map(connection), limits: RENTAL_LIMITS };
}

async function ownedUnit(id: string, user: AuthIdentity) {
  validId(id);
  const [unit] = await getDb().select().from(rentalUnits).where(and(eq(rentalUnits.id, id), eq(rentalUnits.ownerId, user.userId))).limit(1);
  if (!unit) throw unavailable(); return unit;
}

async function accessibleConnection(id: string, user: AuthIdentity) {
  validId(id);
  const [row] = await getDb().select().from(rentalConnections).where(eq(rentalConnections.id, id)).limit(1);
  if (!row) throw unavailable();
  const intended = row.status === "pending" && row.expiresAt > new Date().toISOString() && row.inviteEmail === normalizeRentalEmail(user.email);
  if (row.ownerId !== user.userId && row.renterId !== user.userId && !intended) throw unavailable();
  return row;
}

export async function rentalConnectionFor(id: string, user: AuthIdentity) {
  const row = await accessibleConnection(id, user);
  const [events, bills] = await Promise.all([
    getDb().select().from(rentalEvents).where(eq(rentalEvents.connectionId, id)).orderBy(desc(rentalEvents.createdAt)).limit(30),
    getDb().select({ ...getTableColumns(rentalBills), ...billBalanceColumns }).from(rentalBills).where(and(eq(rentalBills.connectionId, id), or(eq(rentalBills.ownerId, user.userId), eq(rentalBills.renterId, user.userId)))).orderBy(desc(rentalBills.month), desc(rentalBills.createdAt)).limit(12),
  ]);
  return { connection: connection(row), events, bills, billing: await billingForConnection(connection(row)) };
}

export async function createRentalUnit(input: unknown, user: AuthIdentity) {
  const data = rentalUnitInput.parse(input), id = rentalCreateRequest.parse(input).requestId || crypto.randomUUID(), now = new Date().toISOString(), db = getDb();
  const existing = async () => {
    const [row] = await db.select().from(rentalUnits).where(and(eq(rentalUnits.id, id), eq(rentalUnits.ownerId, user.userId))).limit(1);
    if (!row) return false;
    if (!Object.entries(data).every(([key, value]) => row[key as keyof typeof row] === value)) throw new HttpError(409, "This saved unit has different details. Refresh My Rentals.");
    return true;
  };
  if (await existing()) return { id };
  try { await db.insert(rentalUnits).values({ id, ownerId: user.userId, ...data, createdAt: now, updatedAt: now }); }
  catch (error) { if (!await existing()) throw error; }
  return { id };
}

export async function changeRentalUnit(id: string, input: unknown, user: AuthIdentity) {
  const unit = await ownedUnit(id, user), data = rentalUnitAction.parse(input);
  if (unit.updatedAt !== data.version) throw new HttpError(409, "This unit changed. Refresh My Rentals and try again.");
  const db = getDb(), now = versionAfter(unit.updatedAt);
  const active = await db.select({ id: rentalConnections.id }).from(rentalConnections).where(and(eq(rentalConnections.unitId, id), or(eq(rentalConnections.status, "accepted"), and(eq(rentalConnections.status, "pending"), gt(rentalConnections.expiresAt, new Date().toISOString()))))).limit(1);
  if (active.length) throw new HttpError(409, "Revoke the pending invitation or close the connection before changing this unit.");
  if (data.action === "update" && unit.archivedAt) throw new HttpError(409, "Restore this unit before editing it.");
  const changes = data.action === "update" ? { ...data.data, updatedAt: now } : { archivedAt: data.action === "archive" ? now : null, updatedAt: now };
  const updated = await db.update(rentalUnits).set(changes).where(and(eq(rentalUnits.id, id), eq(rentalUnits.ownerId, user.userId), eq(rentalUnits.updatedAt, data.version))).returning({ id: rentalUnits.id });
  if (!updated.length) throw new HttpError(409, "This unit changed. Refresh My Rentals and try again.");
  return { id };
}

export async function createRentalInvitation(input: unknown, user: AuthIdentity) {
  const data = rentalInviteInput.parse(input), unit = await ownedUnit(data.unitId, user);
  if (data.email === normalizeRentalEmail(user.email)) throw new HttpError(400, "Use your renter's sign-in email, rather than your own.");
  if (unit.archivedAt) throw new HttpError(409, "Restore this unit before inviting a renter.");
  if (unit.updatedAt !== data.unitVersion) throw new HttpError(409, "The unit details changed. Refresh and check them before inviting.");
  if (unit.leaseEnd && unit.leaseEnd < philippinesDay()) throw new HttpError(409, "Update the rental dates before inviting a renter.");
  const now = new Date().toISOString(), expires = new Date(Date.now() + RENTAL_LIMITS.invitationDays * 86400000).toISOString(), id = crypto.randomUUID(), db = database();
  const results = await db.batch([
    db.prepare("UPDATE rental_connections SET status = 'expired', responded_at = ? WHERE unit_id = ? AND owner_id = ? AND status = 'pending' AND expires_at <= ?").bind(now, unit.id, user.userId, now),
    db.prepare("INSERT INTO rental_connections (id, unit_id, owner_id, owner_name, owner_email, invite_email, status, property_name, unit_name, city, address, monthly_rent_cents, due_day, lease_start, lease_end, created_at, created_day, expires_at) SELECT ?, u.id, u.owner_id, ?, ?, ?, 'pending', u.property_name, u.unit_name, u.city, u.address, u.monthly_rent_cents, u.due_day, u.lease_start, u.lease_end, ?, ?, ? FROM rental_units u WHERE u.id = ? AND u.owner_id = ? AND u.archived_at IS NULL AND u.updated_at = ? AND NOT EXISTS (SELECT 1 FROM rental_connections c WHERE c.unit_id = u.id AND c.status IN ('pending', 'accepted')) RETURNING id")
      .bind(id, user.displayName, user.email, data.email, now, philippinesDay(), expires, unit.id, user.userId, data.unitVersion),
  ]);
  if (!results[1].results.length) throw new HttpError(409, "This unit changed or already has a pending or accepted connection. Refresh and try again.");
  return { id, expiresAt: expires };
}

export async function changeRentalConnection(id: string, input: unknown, user: AuthIdentity) {
  const data = rentalConnectionAction.parse(input), row = await accessibleConnection(id, user), db = database(), now = new Date().toISOString();
  const owner = row.ownerId === user.userId;
  if (data.action === "accept" || data.action === "decline") {
    const target = data.action === "accept" ? "accepted" : "declined";
    if (!owner && row.renterId === user.userId && row.status === target) return { id };
    if (owner || row.inviteEmail !== normalizeRentalEmail(user.email)) throw new HttpError(403, "Only the invited renter can respond.");
    if (row.status !== "pending" || row.expiresAt <= now) throw new HttpError(409, "This invitation is no longer available.");
    if (data.action === "accept" && row.leaseEnd && row.leaseEnd < philippinesDay()) throw new HttpError(409, "The rental dates have passed. Ask the owner for an updated invitation.");
    const changed = await db.prepare("UPDATE rental_connections SET status = ?, renter_id = ?, renter_name = ?, renter_email = ?, responded_at = ? WHERE id = ? AND status = 'pending' AND expires_at > ? AND invite_email = ? AND owner_id <> ? RETURNING id")
      .bind(target, user.userId, user.displayName, user.email, now, id, now, normalizeRentalEmail(user.email), user.userId).first();
    if (!changed) {
      const current = await accessibleConnection(id, user);
      if (current.status !== target || current.renterId !== user.userId) throw new HttpError(409, "This invitation changed. Refresh My Rentals.");
    }
  } else if (data.action === "revoke") {
    if (!owner) throw new HttpError(403, "Only the owner can revoke this invitation.");
    if (row.status === "revoked") return { id };
    const changed = await db.prepare("UPDATE rental_connections SET status = 'revoked', responded_at = ? WHERE id = ? AND owner_id = ? AND status = 'pending' AND expires_at > ? RETURNING id").bind(now, id, user.userId, now).first();
    if (!changed) throw new HttpError(409, "This invitation changed or expired. Refresh My Rentals.");
  } else {
    if (!owner && row.renterId !== user.userId) throw new HttpError(403, "Only the connected owner or renter can close this record.");
    if (row.status === "ended") return { id };
    const changed = await db.prepare("UPDATE rental_connections SET status = 'ended', ended_at = ?, ended_by = ? WHERE id = ? AND status = 'accepted' AND (owner_id = ? OR renter_id = ?) RETURNING id").bind(now, user.userId, id, user.userId, user.userId).first();
    if (!changed) {
      const current = await accessibleConnection(id, user);
      if (current.status !== "ended") throw new HttpError(409, "This connection changed. Refresh My Rentals.");
    }
  }
  return { id };
}

export function rentalError(error: unknown): Response {
  if (error instanceof HttpError || error instanceof SyntaxError || error && typeof error === "object" && "issues" in error) return routeError(error);
  let details = "";
  for (let cause = error, depth = 0; cause instanceof Error && depth < 5; depth++, cause = cause.cause) details += " " + cause.message;
  const rules: [string, number, string][] = [
    ["RENTAL_SCHEDULE_STATE", 409, "This automatic billing setup changed. Refresh the rental and review its dates."],
    ["RENTAL_SCHEDULE_CONNECTION", 409, "Automatic bills need an open accepted rental and a full calendar month within its agreed dates."],
    ["RENTAL_SCHEDULE_FULL", 409, "Automatic billing has reached the testing limit. Please contact Malapit."],
    ["RENTAL_PAYMENTS_FULL", 409, "Payment records have reached the testing limit. Please contact Malapit."],
    ["RENTAL_PAYMENTS_DAILY", 429, "You can add up to 30 payment records per Philippine day. Please try again tomorrow."],
    ["RENTAL_PAYMENT_BILL", 409, "This bill changed or was cancelled. Refresh before recording a payment."],
    ["RENTAL_PAYMENT_OVERPAY", 409, "The amount exceeds this bill’s remaining balance in the records."],
    ["RENTAL_PAYMENT_DUPLICATE", 409, "This reference already appears on another confirmed record. Check it and give a reason before confirming it again."],
    ["RENTAL_PAYMENT_PENDING", 409, "This bill already has a payment awaiting confirmation. Review or cancel that report first."],
    ["UNIQUE constraint failed: rental_payments.bill_id", 409, "This bill already has a payment awaiting confirmation. Review or cancel that report first."],
    ["UNIQUE constraint failed: rental_payments.id", 409, "This payment request was already used. Refresh the bill."],
    ["RENTAL_PAYMENT_STATE", 409, "This payment record changed. Refresh the bill before trying again."],
    ["RENTAL_PAYMENT_DATE", 400, "Enter a valid payment date that is not in the future."],
    ["RENTAL_PAYMENT_AMOUNT", 400, "Enter an amount in whole cents."],
    ["RENTAL_BILL_HAS_PAYMENTS", 409, "This bill has a pending or confirmed payment record. Review its payment history before cancelling it."],
    ["RENTAL_BILLS_FULL", 409, "Rent bills have reached the testing limit. Please contact Malapit."],
    ["RENTAL_BILLS_DAILY", 429, "You can create up to 60 rent bills per Philippine day. Please try again tomorrow."],
    ["RENTAL_BILL_CONNECTION", 409, "This rental connection changed or closed. Refresh before creating a bill."],
    ["RENTAL_BILL_PERIOD", 400, "Check the covered dates. Bills must stay within the agreed rental dates and cover up to 31 days."],
    ["RENTAL_BILL_OVERLAP", 409, "An existing bill already covers some of these dates. Check it before creating another."],
    ["RENTAL_BILL_MONTH", 409, "This rental already has a bill for that billing month. Open it, or cancel it for correction first."],
    ["UNIQUE constraint failed: rental_bills.connection_id, rental_bills.month", 409, "This rental already has a bill for that billing month. Open it, or cancel it for correction first."],
    ["UNIQUE constraint failed: rental_bills.id", 409, "This bill request was already used. Refresh your bills."],
    ["RENTAL_UNITS_FULL", 409, "My Rentals has reached its testing limit of 100 active units. Please contact Malapit."],
    ["RENTAL_OWNER_LIMIT", 409, "You can manage up to 30 active units. Archive an unused unit to add another."],
    ["RENTAL_INVITES_DAILY", 429, "You can prepare up to 30 invitations per Philippine day. Please try again tomorrow."],
    ["RENTAL_UNIT_LOCKED", 409, "Revoke the invitation or close the connection before changing this unit."],
    ["RENTAL_UNIT_CHANGED", 409, "The unit changed. Refresh and check its details."],
    ["RENTAL_CONNECTION_STATE", 409, "This invitation or connection changed. Refresh My Rentals."],
    ["UNIQUE constraint failed: rental_connections.unit_id", 409, "This unit already has a pending or accepted connection."],
    ["UNIQUE constraint failed: rental_units.id", 409, "This request was already used. Refresh My Rentals and try again."],
  ];
  for (const [code, status, message] of rules) if (details.includes(code)) return Response.json({ error: message }, { status });
  console.error("Private rental request failed");
  return Response.json({ error: "My Rentals could not complete that request. Please try again." }, { status: 500 });
}
