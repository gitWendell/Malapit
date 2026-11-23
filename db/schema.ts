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
export const inquiryMessages = sqliteTable("inquiry_messages", {
  seq: integer("seq").primaryKey({ autoIncrement: true }), id: text("id").notNull().unique(),
  inquiryId: text("inquiry_id").notNull().references(() => inquiries.id, { onDelete: "cascade" }),
  senderId: text("sender_id").notNull(), senderName: text("sender_name").notNull(), role: text("role").notNull(),
  body: text("body").notNull(), createdAt: text("created_at").notNull(), createdDay: text("created_day").notNull(),
}, table => [index("inquiry_messages_thread").on(table.inquiryId, table.seq), index("inquiry_messages_sender_day").on(table.senderId, table.createdDay), check("inquiry_message_role", sql`${table.role} IN ('owner','renter','reviewer')`), check("inquiry_message_body", sql`length(trim(${table.body})) BETWEEN 1 AND 2000`)]);
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

export const rentalBills = sqliteTable("rental_bills", {
  id: text("id").primaryKey(), connectionId: text("connection_id").notNull().references(() => rentalConnections.id),
  ownerId: text("owner_id").notNull(), renterId: text("renter_id").notNull(),
  month: text("month").notNull(), periodStart: text("period_start").notNull(), periodEnd: text("period_end").notNull(), dueDate: text("due_date").notNull(),
  amountCents: integer("amount_cents").notNull(), note: text("note").notNull().default(""), status: text("status").notNull().default("issued"),
  createdAt: text("created_at").notNull(), createdDay: text("created_day").notNull(), voidedAt: text("voided_at"), voidReason: text("void_reason"),
  source: text("source").notNull().default("manual"),
}, table => [
  uniqueIndex("rental_bill_live_month").on(table.connectionId, table.month).where(sql`${table.status} = 'issued'`),
  index("rental_bills_owner_month").on(table.ownerId, table.month, table.dueDate), index("rental_bills_renter_month").on(table.renterId, table.month, table.dueDate),
  index("rental_bills_daily").on(table.ownerId, table.createdDay), index("rental_bills_period").on(table.connectionId, table.status, table.periodStart, table.periodEnd), index("rental_bills_notification_due").on(table.status,table.dueDate),
  check("rental_bill_amount", sql`${table.amountCents} BETWEEN 1 AND 100000000`),
  check("rental_bill_status", sql`${table.status} IN ('issued', 'voided')`),
]);

export const rentalBillEvents = sqliteTable("rental_bill_events", {
  id: text("id").primaryKey(), billId: text("bill_id").notNull().references(() => rentalBills.id), actorId: text("actor_id").notNull(),
  actorName: text("actor_name").notNull(), action: text("action").notNull(), reason: text("reason").notNull().default(""), createdAt: text("created_at").notNull(),
}, table => [index("rental_bill_events_bill").on(table.billId, table.createdAt)]);

export const rentalPayments = sqliteTable("rental_payments", {
  id: text("id").primaryKey(), billId: text("bill_id").notNull().references(() => rentalBills.id), ownerId: text("owner_id").notNull(), renterId: text("renter_id").notNull(), submittedBy: text("submitted_by").notNull(),
  amountCents: integer("amount_cents").notNull(), method: text("method").notNull(), paidAt: text("paid_at").notNull(), reference: text("reference").notNull().default(""), referenceKey: text("reference_key"), note: text("note").notNull().default(""),
  status: text("status").notNull(), createdAt: text("created_at").notNull(), createdDay: text("created_day").notNull(),
  reviewedAt: text("reviewed_at"), reviewedBy: text("reviewed_by"), decisionReason: text("decision_reason"), duplicateReason: text("duplicate_reason"),
  destinationId: text("destination_id"), destinationSnapshot: text("destination_snapshot"),
  reversedAt: text("reversed_at"), reversedBy: text("reversed_by"), reversalReason: text("reversal_reason"),
}, table => [
  uniqueIndex("rental_payment_pending_bill").on(table.billId).where(sql`${table.status} = 'pending'`),
  index("rental_payments_bill_status").on(table.billId, table.status), index("rental_payments_bill_created").on(table.billId, table.createdAt),
  index("rental_payments_reference").on(table.ownerId, table.method, table.referenceKey, table.status), index("rental_payments_daily").on(table.submittedBy, table.createdDay),
  index("rental_payments_owner_status").on(table.ownerId, table.status, table.createdAt),
  check("rental_payment_amount", sql`${table.amountCents} BETWEEN 1 AND 100000000`),
  check("rental_payment_method", sql`${table.method} IN ('cash', 'gcash', 'maya', 'bank', 'other')`),
  check("rental_payment_status", sql`${table.status} IN ('pending', 'confirmed', 'rejected', 'cancelled', 'reversed')`),
]);
export const rentalPaymentEvents = sqliteTable("rental_payment_events", {
  id: text("id").primaryKey(), paymentId: text("payment_id").notNull().references(() => rentalPayments.id), actorId: text("actor_id").notNull(), actorName: text("actor_name").notNull(),
  action: text("action").notNull(), reason: text("reason").notNull().default(""), createdAt: text("created_at").notNull(),
}, table => [index("rental_payment_events_payment").on(table.paymentId, table.createdAt)]);

export const rentalBillSchedules = sqliteTable("rental_bill_schedules", {
  connectionId: text("connection_id").primaryKey().references(() => rentalConnections.id), ownerId: text("owner_id").notNull(),
  status: text("status").notNull(), firstMonth: text("first_month").notNull(), nextMonth: text("next_month").notNull(),
  issue: text("issue").notNull().default(""), version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(), updatedBy: text("updated_by").notNull(),
  lastCheckedAt: text("last_checked_at"), lastBillId: text("last_bill_id").references(() => rentalBills.id),
}, table => [index("rental_bill_schedules_due").on(table.status, table.nextMonth), index("rental_bill_schedules_owner").on(table.ownerId, table.status), check("rental_schedule_status", sql`${table.status} IN ('enabled','paused','attention','finished')`)]);

// Link a public listing to one private unit and retain each renter's offer snapshot.
export const rentalListingUnits = sqliteTable("rental_listing_units", {
  listingId: text("listing_id").primaryKey().references(() => listings.id),
  unitId: text("unit_id").notNull().unique().references(() => rentalUnits.id),
});
export const inquiryRentalOffers = sqliteTable("inquiry_rental_offers", {
  connectionId: text("connection_id").primaryKey().references(() => rentalConnections.id),
  inquiryId: text("inquiry_id").notNull().references(() => inquiries.id),
  targetRenterId: text("target_renter_id").notNull(), firstBillId: text("first_bill_id").notNull().unique(),
  amountCents: integer("amount_cents").notNull(), periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(), dueDate: text("due_date").notNull(), note: text("note").notNull().default(""),
}, table => [index("inquiry_rental_offer_thread").on(table.inquiryId), check("inquiry_rental_offer_amount", sql`${table.amountCents} BETWEEN 1 AND 100000000`)]);

// Sandbox payments deliberately never enter rental_payments or real balances.
export const hitpaySandboxCheckouts = sqliteTable("hitpay_sandbox_checkouts", {
  id: text("id").primaryKey(), billId: text("bill_id").notNull().references(() => rentalBills.id),
  ownerId: text("owner_id").notNull(), renterId: text("renter_id").notNull(), actorId: text("actor_id").notNull(),
  businessId: text("business_id").notNull(), providerId: text("provider_id").unique(), checkoutUrl: text("checkout_url"),
  status: text("status").notNull().default("creating"), amountCents: integer("amount_cents").notNull().default(100), currency: text("currency").notNull().default("SGD"),
  createdAt: text("created_at").notNull(), createdDay: text("created_day").notNull(), updatedAt: text("updated_at").notNull(), verifiedAt: text("verified_at"),
}, table => [index("hitpay_sandbox_bill").on(table.billId,table.createdAt), index("hitpay_sandbox_daily").on(table.actorId,table.createdDay), uniqueIndex("hitpay_sandbox_open_bill").on(table.billId).where(sql`${table.status} IN ('creating','pending','unknown')`), check("hitpay_sandbox_fixed_amount",sql`${table.amountCents}=100 AND ${table.currency}='SGD'`), check("hitpay_sandbox_status",sql`${table.status} IN ('creating','pending','unknown','completed','failed','expired','canceled','inactive')`)]);

export const ownerPaymentQrs = sqliteTable("owner_payment_qrs", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), data: text("data").notNull(),
  byteSize: integer("byte_size").notNull(), checksum: text("checksum").notNull(), createdAt: text("created_at").notNull(), createdDay: text("created_day").notNull(),
}, table => [index("owner_payment_qrs_owner").on(table.ownerId,table.createdDay), check("owner_payment_qr_bytes",sql`${table.byteSize} BETWEEN 45 AND 204800`)]);
export const ownerPaymentMethods = sqliteTable("owner_payment_methods", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), kind: text("kind").notNull(),
  label: text("label").notNull().default(""), accountName: text("account_name").notNull().default(""), accountNumber: text("account_number").notNull().default(""), instructions: text("instructions").notNull().default(""),
  qrImageId: text("qr_image_id").references(() => ownerPaymentQrs.id), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(), archivedAt: text("archived_at"),
}, table => [index("owner_payment_methods_owner").on(table.ownerId,table.archivedAt),check("owner_payment_method_kind",sql`${table.kind} IN ('gcash','maya','bank','qr','cash','other')`)]);

export const appNotifications = sqliteTable("app_notifications", {
  id: text("id").primaryKey(), userId: text("user_id"), recipientEmail: text("recipient_email"),
  kind: text("kind").notNull(), targetId: text("target_id").notNull(), createdAt: text("created_at").notNull(), readAt: text("read_at"),
}, table => [index("notifications_user").on(table.userId,table.createdAt), index("notifications_email").on(table.recipientEmail,table.createdAt), index("notifications_created").on(table.createdAt), check("notification_recipient",sql`${table.userId} IS NOT NULL OR ${table.recipientEmail} IS NOT NULL`)]);
export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), email: text("email").notNull(),
  endpoint: text("endpoint").notNull().unique(), p256dh: text("p256dh").notNull(), auth: text("auth").notNull(),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, table => [index("push_subscriptions_user").on(table.userId), index("push_subscriptions_email").on(table.email)]);
export const pushDeliveries = sqliteTable("push_deliveries", {
  notificationId: text("notification_id").notNull().references(() => appNotifications.id,{onDelete:"cascade"}),
  subscriptionId: text("subscription_id").notNull().references(() => pushSubscriptions.id,{onDelete:"cascade"}),
  attempts: integer("attempts").notNull().default(0), nextAttemptAt: text("next_attempt_at").notNull(), leaseUntil: text("lease_until"),
  sentAt: text("sent_at"), failedAt: text("failed_at"),
}, table => [primaryKey({columns:[table.notificationId,table.subscriptionId]}), index("push_delivery_queue").on(table.sentAt,table.failedAt,table.nextAttemptAt)]);
