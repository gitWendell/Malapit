import { and, asc, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { z } from "zod";
import { rentalBillEvents, rentalBills, rentalConnections } from "../db/schema";
import type { AuthIdentity } from "./auth";
import { getDb, HttpError } from "./server";
import { philippinesDay } from "./rentals";
import { billPeriodError, isBillingMonth, rentalBillAction, rentalBillInput, type RentalBill, type RentalBillsPage } from "./rental-bills";

const unavailable = () => new HttpError(404, "This rent bill is not available to this account.");
const validId = (id: string) => { if (!z.string().uuid().safeParse(id).success) throw unavailable(); };
async function accessibleBill(id: string, user: AuthIdentity) {
  validId(id);
  const [bill] = await getDb().select().from(rentalBills).where(and(eq(rentalBills.id, id), sql`(${rentalBills.ownerId} = ${user.userId} OR ${rentalBills.renterId} = ${user.userId})`)).limit(1);
  if (!bill) throw unavailable();
  return bill as RentalBill;
}

export async function rentalBillsFor(url: URL, user: AuthIdentity): Promise<RentalBillsPage> {
  const query = z.object({ month: z.string().refine(isBillingMonth, "Choose a valid billing month."), role: z.enum(["owner", "renter"]), page: z.coerce.number().int().min(0).max(100) }).parse({ month: url.searchParams.get("month") || philippinesDay().slice(0, 7), role: url.searchParams.get("role") || "owner", page: url.searchParams.get("page") || 0 });
  const db = getDb(), day = philippinesDay();
  const scope = and(eq(query.role === "owner" ? rentalBills.ownerId : rentalBills.renterId, user.userId), eq(rentalBills.month, query.month));
  const [rows, totals] = await Promise.all([
    db.select({ ...getTableColumns(rentalBills), propertyName: rentalConnections.propertyName, unitName: rentalConnections.unitName, ownerName: rentalConnections.ownerName, renterName: rentalConnections.renterName }).from(rentalBills).innerJoin(rentalConnections, eq(rentalConnections.id, rentalBills.connectionId)).where(scope).orderBy(asc(rentalBills.dueDate), desc(rentalBills.createdAt), asc(rentalBills.id)).limit(101).offset(query.page * 100),
    db.select({ count: sql<number>`count(*)`, amountCents: sql<number>`coalesce(sum(${rentalBills.amountCents}), 0)`, past: sql<number>`coalesce(sum(case when ${rentalBills.dueDate} < ${day} then 1 else 0 end), 0)`, today: sql<number>`coalesce(sum(case when ${rentalBills.dueDate} = ${day} then 1 else 0 end), 0)`, upcoming: sql<number>`coalesce(sum(case when ${rentalBills.dueDate} > ${day} then 1 else 0 end), 0)` }).from(rentalBills).where(and(scope, eq(rentalBills.status, "issued"))),
  ]);
  return { bills: rows.slice(0, 100) as RentalBillsPage["bills"], hasMore: rows.length > 100, totals: totals[0], month: query.month };
}

export async function rentalBillFor(id: string, user: AuthIdentity) {
  const bill = await accessibleBill(id, user), db = getDb();
  const [connections, events, current] = await Promise.all([
    db.select().from(rentalConnections).where(eq(rentalConnections.id, bill.connectionId)).limit(1),
    db.select().from(rentalBillEvents).where(eq(rentalBillEvents.billId, id)).orderBy(asc(rentalBillEvents.createdAt)),
    db.select({ id: rentalBills.id }).from(rentalBills).where(and(eq(rentalBills.connectionId, bill.connectionId), eq(rentalBills.month, bill.month), eq(rentalBills.status, "issued"))).limit(1),
  ]);
  if (!connections.length) throw unavailable();
  return { bill, connection: connections[0], events, currentBillId: current[0]?.id || null };
}

export async function createRentalBill(input: unknown, user: AuthIdentity) {
  const data = rentalBillInput.parse(input), db = getDb(), id = data.requestId;
  const values = { connectionId: data.connectionId, month: data.month, periodStart: data.periodStart, periodEnd: data.periodEnd, dueDate: data.dueDate, amountCents: data.amountCents, note: data.note };
  const existing = async () => {
    const [bill] = await db.select().from(rentalBills).where(and(eq(rentalBills.id, id), eq(rentalBills.ownerId, user.userId))).limit(1);
    if (!bill) return false;
    if (!Object.entries(values).every(([key, value]) => bill[key as keyof typeof bill] === value)) throw new HttpError(409, "This request already saved different bill details. Refresh your bills.");
    return true;
  };
  if (await existing()) return { id };
  const [connection] = await db.select().from(rentalConnections).where(and(eq(rentalConnections.id, data.connectionId), eq(rentalConnections.ownerId, user.userId))).limit(1);
  if (!connection) throw unavailable();
  if (connection.status !== "accepted" || !connection.renterId) throw new HttpError(409, "Create bills only after the renter accepts an open connection.");
  const error = billPeriodError(data, connection);
  if (error) throw new HttpError(400, error);
  try { await db.insert(rentalBills).values({ id, ...values, ownerId: user.userId, renterId: connection.renterId, status: "issued", createdAt: new Date().toISOString(), createdDay: philippinesDay() }); }
  catch (cause) { if (!await existing()) throw cause; }
  return { id };
}

export async function changeRentalBill(id: string, input: unknown, user: AuthIdentity) {
  const data = rentalBillAction.parse(input), bill = await accessibleBill(id, user);
  if (bill.ownerId !== user.userId) throw new HttpError(403, "Only the owner can cancel a bill for correction.");
  const alreadyVoided = (current: RentalBill) => {
    if (current.status !== "voided" || current.voidReason !== data.reason) throw new HttpError(409, "This bill changed. Refresh it to see the latest record.");
    return { id };
  };
  if (bill.status === "voided") return alreadyVoided(bill);
  const result = await getDb().update(rentalBills).set({ status: "voided", voidedAt: new Date().toISOString(), voidReason: data.reason }).where(and(eq(rentalBills.id, id), eq(rentalBills.ownerId, user.userId), eq(rentalBills.status, "issued"))).returning({ id: rentalBills.id });
  if (!result.length) return alreadyVoided(await accessibleBill(id, user));
  return { id };
}
