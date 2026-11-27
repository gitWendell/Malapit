import { env } from "cloudflare:workers";
import { and, eq, sql } from "drizzle-orm";
import { inquiries, inquiryRentalOffers, listings, rentalConnections, rentalListingUnits, rentalUnits } from "../db/schema";
import type { AuthIdentity } from "./auth";
import { getDb, HttpError, listingRecord } from "./server";
import { firstRentPeriod, inquiryRentalInput, type InquiryRentalSetup } from "./inquiry-rentals";
import { normalizeRentalEmail, philippinesDay, RENTAL_LIMITS } from "./rentals";

// Explicit outer qualification is required inside this correlated D1 subquery.
export const inquiryRentalSummary = sql<string | null>`(SELECT json_object('connectionId',c.id,'status',CASE WHEN c.status='pending' AND c.expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN 'expired' ELSE c.status END,
 'billId',CASE WHEN c.status IN('accepted','ended') THEN coalesce(b.id,o.first_bill_id) ELSE NULL END,'billStatus',b.status,
 'remainingCents',CASE WHEN b.id IS NOT NULL THEN max(0,b.amount_cents-coalesce((SELECT sum(p.amount_cents) FROM rental_payments p WHERE p.bill_id=b.id AND p.status='confirmed'),0)) ELSE NULL END,
 'pendingPayment',EXISTS(SELECT 1 FROM rental_payments p WHERE p.bill_id=b.id AND p.status='pending'))
 FROM inquiry_rental_offers o JOIN rental_connections c ON c.id=o.connection_id LEFT JOIN rental_bills b ON b.id=coalesce((SELECT latest.id FROM rental_bills latest WHERE latest.connection_id=c.id AND latest.status='issued' ORDER BY CASE WHEN EXISTS(SELECT 1 FROM rental_payments waiting WHERE waiting.bill_id=latest.id AND waiting.status='pending') THEN 0 WHEN latest.amount_cents>coalesce((SELECT sum(credited.amount_cents) FROM rental_payments credited WHERE credited.bill_id=latest.id AND credited.status='confirmed'),0) THEN 1 ELSE 2 END, CASE WHEN latest.amount_cents>coalesce((SELECT sum(credited.amount_cents) FROM rental_payments credited WHERE credited.bill_id=latest.id AND credited.status='confirmed'),0) THEN latest.due_date END ASC,latest.period_start DESC,latest.created_at DESC,latest.id DESC LIMIT 1),o.first_bill_id)
 WHERE o.inquiry_id=inquiries.id ORDER BY c.created_at DESC,c.id DESC LIMIT 1)`;
const unavailable = () => new HttpError(404, "This rental setup is not available to this account.");
async function ownedInquiry(id: string, user: AuthIdentity) {
  const [row] = await getDb().select().from(inquiries).where(and(eq(inquiries.id, id), eq(inquiries.ownerId, user.userId))).limit(1);
  if (!row) throw unavailable();
  if (row.isDemo || row.renterId === user.userId) throw new HttpError(400, "Only real inquiries from a different renter can become a rental.");
  const [listing] = await getDb().select().from(listings).where(and(eq(listings.id, row.listingId), eq(listings.ownerId, user.userId))).limit(1);
  if (!listing) throw unavailable();
  return { row, listing };
}
export async function inquiryRentalSetup(id: string, user: AuthIdentity): Promise<InquiryRentalSetup> {
  const { row, listing } = await ownedInquiry(id, user), home = listingRecord(listing);
  const start = row.moveIn < philippinesDay() ? philippinesDay() : row.moveIn;
  const terms = { propertyName: home.title.slice(0,100), unitName: home.type, city: home.city, address: home.address, monthlyRentCents: Math.round(home.price * 100), dueDay: Number(start.slice(-2)), leaseStart: start, leaseEnd: null };
  return { terms, renterName: row.renterName, firstBill: { month: start.slice(0,7), ...firstRentPeriod(start, null), dueDate: start, amountCents: terms.monthlyRentCents, note: "" } };
}
export async function createInquiryRental(id: string, input: unknown, user: AuthIdentity) {
  const data = inquiryRentalInput.parse(input), { row, listing } = await ownedInquiry(id, user), db = getDb();
  const existing = async () => {
    const [saved] = await db.select({ offer: inquiryRentalOffers, connection: rentalConnections }).from(inquiryRentalOffers).innerJoin(rentalConnections, eq(rentalConnections.id, inquiryRentalOffers.connectionId)).where(and(eq(inquiryRentalOffers.connectionId, data.requestId), eq(inquiryRentalOffers.inquiryId, id), eq(rentalConnections.ownerId, user.userId))).limit(1);
    if (!saved) return null;
    if (!Object.entries(data.terms).every(([key,value]) => saved.connection[key as keyof typeof saved.connection] === value) || !Object.entries(data.firstBill).every(([key,value]) => key === "month" || saved.offer[key as keyof typeof saved.offer] === value)) throw new HttpError(409, "This request already saved different rental details. Open the existing rental.");
    return { id: saved.connection.id };
  };
  const repeated = await existing(); if (repeated) return repeated;
  if (!["published", "paused"].includes(listing.status)) throw new HttpError(409, "This listing is not available for a new rental. Check it in My listings.");
  if (data.terms.leaseEnd && data.terms.leaseEnd < philippinesDay()) throw new HttpError(400, "Choose rental dates that have not ended.");
  const [link] = await db.select({ unit: rentalUnits }).from(rentalListingUnits).innerJoin(rentalUnits, eq(rentalUnits.id, rentalListingUnits.unitId)).where(eq(rentalListingUnits.listingId, row.listingId)).limit(1);
  if (link?.unit.archivedAt) throw new HttpError(409, "Restore this property's private unit in My Rentals first.");
  const unitId = link?.unit.id || crypto.randomUUID(), now = new Date().toISOString(), day = philippinesDay(), expires = new Date(Date.now()+RENTAL_LIMITS.invitationDays*86400000).toISOString(), billId = crypto.randomUUID();
  const terms = data.terms, statements: D1PreparedStatement[] = [];
  statements.push(env.DB!.prepare("UPDATE rental_connections SET status='expired', responded_at=? WHERE unit_id=? AND status='pending' AND expires_at<=?").bind(now,unitId,now));
  if (link) statements.push(env.DB!.prepare("UPDATE rental_units SET property_name=?,unit_name=?,city=?,address=?,monthly_rent_cents=?,due_day=?,lease_start=?,lease_end=?,updated_at=? WHERE id=? AND owner_id=? AND updated_at=?").bind(terms.propertyName,terms.unitName,terms.city,terms.address,terms.monthlyRentCents,terms.dueDay,terms.leaseStart,terms.leaseEnd,now,unitId,user.userId,link.unit.updatedAt));
  else {
    statements.push(env.DB!.prepare("INSERT INTO rental_units(id,owner_id,property_name,unit_name,city,address,monthly_rent_cents,due_day,lease_start,lease_end,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(unitId,user.userId,terms.propertyName,terms.unitName,terms.city,terms.address,terms.monthlyRentCents,terms.dueDay,terms.leaseStart,terms.leaseEnd,now,now));
    statements.push(env.DB!.prepare("INSERT INTO rental_listing_units(listing_id,unit_id) VALUES(?,?)").bind(row.listingId,unitId));
  }
  statements.push(env.DB!.prepare("INSERT INTO rental_connections(id,unit_id,owner_id,owner_name,owner_email,invite_email,property_name,unit_name,city,address,monthly_rent_cents,due_day,lease_start,lease_end,created_at,created_day,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(data.requestId,unitId,user.userId,user.displayName,user.email,normalizeRentalEmail(row.renterEmail),terms.propertyName,terms.unitName,terms.city,terms.address,terms.monthlyRentCents,terms.dueDay,terms.leaseStart,terms.leaseEnd,now,day,expires));
  statements.push(env.DB!.prepare("INSERT INTO inquiry_rental_offers(connection_id,inquiry_id,target_renter_id,first_bill_id,amount_cents,period_start,period_end,due_date,note) VALUES(?,?,?,?,?,?,?,?,?)").bind(data.requestId,id,row.renterId,billId,data.firstBill.amountCents,data.firstBill.periodStart,data.firstBill.periodEnd,data.firstBill.dueDate,data.firstBill.note));
  try { await env.DB!.batch(statements); } catch (cause) { const saved = await existing(); if (saved) return saved; throw cause; }
  return { id: data.requestId };
}
