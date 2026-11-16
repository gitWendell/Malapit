import { integer, primaryKey, sqliteTable, text, index, uniqueIndex, check } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
export const listings = sqliteTable("listings", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), ownerName: text("owner_name").notNull(),
  title: text("title").notNull(), city: text("city").notNull(), status: text("status").notNull().default("pending"),
  data: text("data").notNull(), reviewNote: text("review_note").notNull().default(""),
  createdAt: text("created_at").notNull(), confirmedAt: text("confirmed_at").notNull(),
});
export const savedHomes = sqliteTable("saved_homes", { userId: text("user_id").notNull(), listingId: text("listing_id").notNull() }, table => [primaryKey({ columns: [table.userId, table.listingId] })]);
export const inquiries = sqliteTable("inquiries", {
  id: text("id").primaryKey(), listingId: text("listing_id").notNull(), listingTitle: text("listing_title").notNull(),
  ownerId: text("owner_id").notNull(), renterId: text("renter_id").notNull(), renterName: text("renter_name").notNull(),
  renterEmail: text("renter_email").notNull(), message: text("message").notNull(), moveIn: text("move_in").notNull(),
  occupants: integer("occupants").notNull(), reply: text("reply").notNull().default(""),
  isDemo: integer("is_demo").notNull().default(0), createdAt: text("created_at").notNull(),
});
export const reports = sqliteTable("reports", { id: text("id").primaryKey(), listingId: text("listing_id").notNull(), userId: text("user_id").notNull(), reason: text("reason").notNull(), status: text("status").notNull().default("open"), createdAt: text("created_at").notNull() });
export const media = sqliteTable("media", { id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), contentType: text("content_type").notNull(), createdAt: text("created_at").notNull(), byteSize: integer("byte_size").notNull().default(0), state: text("state").notNull().default("ready") });
export const uploadUsage = sqliteTable("upload_usage", { ownerId: text("owner_id").notNull(), day: text("day").notNull(), attempts: integer("attempts").notNull().default(0) }, table => [primaryKey({ columns: [table.ownerId, table.day] })]);
export const settings = sqliteTable("settings", { key: text("key").primaryKey(), value: text("value").notNull() });

export const rentalUnits = sqliteTable("rental_units", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(),
  propertyName: text("property_name").notNull(), unitName: text("unit_name").notNull(), city: text("city").notNull(), address: text("address").notNull(),
  monthlyRentCents: integer("monthly_rent_cents").notNull(), dueDay: integer("due_day").notNull(), leaseStart: text("lease_start").notNull(), leaseEnd: text("lease_end"),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(), archivedAt: text("archived_at"),
}, table => [index("rental_units_owner").on(table.ownerId, table.createdAt), check("rental_unit_rent", sql`${table.monthlyRentCents} BETWEEN 10000 AND 100000000 AND ${table.dueDay} BETWEEN 1 AND 31`)]);

export const rentalConnections = sqliteTable("rental_connections", {
  id: text("id").primaryKey(), unitId: text("unit_id").notNull().references(() => rentalUnits.id), ownerId: text("owner_id").notNull(),
  ownerName: text("owner_name").notNull(), ownerEmail: text("owner_email").notNull(), inviteEmail: text("invite_email").notNull(),
  renterId: text("renter_id"), renterName: text("renter_name"), renterEmail: text("renter_email"), status: text("status").notNull().default("pending"),
  propertyName: text("property_name").notNull(), unitName: text("unit_name").notNull(), city: text("city").notNull(), address: text("address").notNull(),
  monthlyRentCents: integer("monthly_rent_cents").notNull(), dueDay: integer("due_day").notNull(), leaseStart: text("lease_start").notNull(), leaseEnd: text("lease_end"),
  createdAt: text("created_at").notNull(), createdDay: text("created_day").notNull(), expiresAt: text("expires_at").notNull(), respondedAt: text("responded_at"), endedAt: text("ended_at"), endedBy: text("ended_by"),
}, table => [
  uniqueIndex("rental_connection_live_unit").on(table.unitId).where(sql`${table.status} IN ('pending', 'accepted')`),
  index("rental_connections_owner").on(table.ownerId, table.createdAt), index("rental_connections_email").on(table.inviteEmail, table.status, table.expiresAt),
  index("rental_connections_renter").on(table.renterId, table.createdAt), index("rental_connections_daily").on(table.ownerId, table.createdDay),
  check("rental_connection_status", sql`${table.status} IN ('pending', 'accepted', 'declined', 'revoked', 'expired', 'ended')`),
  check("rental_connection_rent", sql`${table.monthlyRentCents} BETWEEN 10000 AND 100000000 AND ${table.dueDay} BETWEEN 1 AND 31`),
  check("rental_connection_parties", sql`${table.renterId} IS NULL OR ${table.renterId} <> ${table.ownerId}`),
]);

export const rentalEvents = sqliteTable("rental_events", {
  id: text("id").primaryKey(), connectionId: text("connection_id").notNull().references(() => rentalConnections.id), actorId: text("actor_id").notNull(), actorName: text("actor_name").notNull(), action: text("action").notNull(), createdAt: text("created_at").notNull(),
}, table => [index("rental_events_connection").on(table.connectionId, table.createdAt)]);
