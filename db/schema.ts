import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
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
export const media = sqliteTable("media", { id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), contentType: text("content_type").notNull(), createdAt: text("created_at").notNull() });
export const settings = sqliteTable("settings", { key: text("key").primaryKey(), value: text("value").notNull() });
