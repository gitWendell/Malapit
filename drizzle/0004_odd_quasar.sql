CREATE TABLE `rental_payment_events` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`action` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `rental_payments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `rental_payment_events_payment` ON `rental_payment_events` (`payment_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `rental_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`bill_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`renter_id` text NOT NULL,
	`submitted_by` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`method` text NOT NULL,
	`paid_at` text NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`reference_key` text,
	`note` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`created_day` text NOT NULL,
	`reviewed_at` text,
	`reviewed_by` text,
	`decision_reason` text,
	`duplicate_reason` text,
	`reversed_at` text,
	`reversed_by` text,
	`reversal_reason` text,
	FOREIGN KEY (`bill_id`) REFERENCES `rental_bills`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "rental_payment_amount" CHECK("rental_payments"."amount_cents" BETWEEN 1 AND 100000000),
	CONSTRAINT "rental_payment_method" CHECK("rental_payments"."method" IN ('cash', 'gcash', 'maya', 'bank', 'other')),
	CONSTRAINT "rental_payment_status" CHECK("rental_payments"."status" IN ('pending', 'confirmed', 'rejected', 'cancelled', 'reversed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rental_payment_pending_bill` ON `rental_payments` (`bill_id`) WHERE "rental_payments"."status" = 'pending';--> statement-breakpoint
CREATE INDEX `rental_payments_bill_status` ON `rental_payments` (`bill_id`,`status`);--> statement-breakpoint
CREATE INDEX `rental_payments_bill_created` ON `rental_payments` (`bill_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `rental_payments_reference` ON `rental_payments` (`owner_id`,`method`,`reference_key`,`status`);--> statement-breakpoint
CREATE INDEX `rental_payments_daily` ON `rental_payments` (`submitted_by`,`created_day`);
--> statement-breakpoint
CREATE TRIGGER rental_payment_insert BEFORE INSERT ON rental_payments
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM rental_bills b WHERE b.id = NEW.bill_id AND b.status = 'issued' AND b.owner_id = NEW.owner_id AND b.renter_id = NEW.renter_id) THEN RAISE(ABORT, 'RENTAL_PAYMENT_BILL') END;
  SELECT CASE WHEN NOT coalesce((
    (NEW.status = 'pending' AND NEW.submitted_by = NEW.renter_id AND NEW.reviewed_at IS NULL AND NEW.reviewed_by IS NULL AND NEW.decision_reason IS NULL AND NEW.duplicate_reason IS NULL)
    OR (NEW.status = 'confirmed' AND NEW.submitted_by = NEW.owner_id AND NEW.reviewed_by = NEW.owner_id AND NEW.reviewed_at IS NOT NULL AND NEW.decision_reason IS NULL AND (NEW.duplicate_reason IS NULL OR length(trim(NEW.duplicate_reason)) BETWEEN 5 AND 400))
  ), 0) OR NEW.reversed_at IS NOT NULL OR NEW.reversed_by IS NOT NULL OR NEW.reversal_reason IS NOT NULL THEN RAISE(ABORT, 'RENTAL_PAYMENT_STATE') END;
  SELECT CASE WHEN typeof(NEW.amount_cents) <> 'integer' THEN RAISE(ABORT, 'RENTAL_PAYMENT_AMOUNT') END;
  SELECT CASE WHEN date(NEW.paid_at, '+0 days') IS NOT NEW.paid_at OR NEW.paid_at > strftime('%Y-%m-%d', 'now', '+8 hours') THEN RAISE(ABORT, 'RENTAL_PAYMENT_DATE') END;
  SELECT CASE WHEN NEW.method IN ('gcash', 'maya', 'bank') AND length(trim(NEW.reference)) < 3 THEN RAISE(ABORT, 'RENTAL_PAYMENT_STATE') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM rental_payments WHERE bill_id = NEW.bill_id AND status = 'pending') THEN RAISE(ABORT, 'RENTAL_PAYMENT_PENDING') END;
  SELECT CASE WHEN NEW.amount_cents + coalesce((SELECT sum(amount_cents) FROM rental_payments WHERE bill_id = NEW.bill_id AND status = 'confirmed'), 0) > (SELECT amount_cents FROM rental_bills WHERE id = NEW.bill_id) THEN RAISE(ABORT, 'RENTAL_PAYMENT_OVERPAY') END;
  SELECT CASE WHEN NEW.status = 'confirmed' AND NEW.reference_key IS NOT NULL AND EXISTS (SELECT 1 FROM rental_payments WHERE owner_id = NEW.owner_id AND method = NEW.method AND reference_key = NEW.reference_key AND status = 'confirmed') AND coalesce(length(trim(NEW.duplicate_reason)), 0) < 5 THEN RAISE(ABORT, 'RENTAL_PAYMENT_DUPLICATE') END;
  SELECT CASE WHEN (SELECT count(*) FROM rental_payments) >= 20000 THEN RAISE(ABORT, 'RENTAL_PAYMENTS_FULL') END;
  SELECT CASE WHEN (SELECT count(*) FROM rental_payments WHERE submitted_by = NEW.submitted_by AND created_day = NEW.created_day) >= 30 THEN RAISE(ABORT, 'RENTAL_PAYMENTS_DAILY') END;
END;
--> statement-breakpoint
CREATE TRIGGER rental_payment_immutable BEFORE UPDATE ON rental_payments
WHEN NEW.id IS NOT OLD.id OR NEW.bill_id IS NOT OLD.bill_id OR NEW.owner_id IS NOT OLD.owner_id OR NEW.renter_id IS NOT OLD.renter_id OR NEW.submitted_by IS NOT OLD.submitted_by
  OR NEW.amount_cents IS NOT OLD.amount_cents OR NEW.method IS NOT OLD.method OR NEW.paid_at IS NOT OLD.paid_at OR NEW.reference IS NOT OLD.reference OR NEW.reference_key IS NOT OLD.reference_key OR NEW.note IS NOT OLD.note
  OR NEW.created_at IS NOT OLD.created_at OR NEW.created_day IS NOT OLD.created_day
BEGIN SELECT RAISE(ABORT, 'RENTAL_PAYMENT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER rental_payment_state BEFORE UPDATE ON rental_payments
WHEN NOT coalesce((
  (OLD.status = 'pending' AND NEW.status = 'confirmed' AND NEW.reviewed_by = OLD.owner_id AND NEW.reviewed_at IS NOT NULL AND NEW.decision_reason IS NULL AND (NEW.duplicate_reason IS NULL OR length(trim(NEW.duplicate_reason)) BETWEEN 5 AND 400) AND NEW.reversed_at IS NULL AND NEW.reversed_by IS NULL AND NEW.reversal_reason IS NULL)
  OR (OLD.status = 'pending' AND NEW.status IN ('rejected', 'cancelled') AND NEW.reviewed_at IS NOT NULL AND NEW.decision_reason IS NOT NULL AND length(trim(NEW.decision_reason)) BETWEEN 5 AND 400
    AND NEW.reviewed_by = CASE WHEN NEW.status = 'rejected' THEN OLD.owner_id ELSE OLD.submitted_by END AND NEW.duplicate_reason IS NULL AND NEW.reversed_at IS NULL AND NEW.reversed_by IS NULL AND NEW.reversal_reason IS NULL)
  OR (OLD.status = 'confirmed' AND NEW.status = 'reversed' AND NEW.reversed_by = OLD.owner_id AND NEW.reversed_at IS NOT NULL AND NEW.reversal_reason IS NOT NULL AND length(trim(NEW.reversal_reason)) BETWEEN 5 AND 400
    AND NEW.reviewed_at IS OLD.reviewed_at AND NEW.reviewed_by IS OLD.reviewed_by AND NEW.decision_reason IS OLD.decision_reason AND NEW.duplicate_reason IS OLD.duplicate_reason)
), 0)
BEGIN SELECT RAISE(ABORT, 'RENTAL_PAYMENT_STATE'); END;
--> statement-breakpoint
CREATE TRIGGER rental_payment_confirm BEFORE UPDATE OF status ON rental_payments
WHEN NEW.status = 'confirmed'
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM rental_bills WHERE id = NEW.bill_id AND status = 'issued') THEN RAISE(ABORT, 'RENTAL_PAYMENT_BILL') END;
  SELECT CASE WHEN NEW.amount_cents + coalesce((SELECT sum(amount_cents) FROM rental_payments WHERE bill_id = NEW.bill_id AND status = 'confirmed' AND id <> OLD.id), 0) > (SELECT amount_cents FROM rental_bills WHERE id = NEW.bill_id) THEN RAISE(ABORT, 'RENTAL_PAYMENT_OVERPAY') END;
  SELECT CASE WHEN NEW.reference_key IS NOT NULL AND EXISTS (SELECT 1 FROM rental_payments WHERE owner_id = NEW.owner_id AND method = NEW.method AND reference_key = NEW.reference_key AND status = 'confirmed' AND id <> OLD.id) AND coalesce(length(trim(NEW.duplicate_reason)), 0) < 5 THEN RAISE(ABORT, 'RENTAL_PAYMENT_DUPLICATE') END;
END;
--> statement-breakpoint
CREATE TRIGGER rental_bill_payment_guard BEFORE UPDATE OF status ON rental_bills
WHEN NEW.status = 'voided' AND EXISTS (SELECT 1 FROM rental_payments WHERE bill_id = OLD.id AND status IN ('pending', 'confirmed'))
BEGIN SELECT RAISE(ABORT, 'RENTAL_BILL_HAS_PAYMENTS'); END;
--> statement-breakpoint
CREATE TRIGGER rental_payment_created AFTER INSERT ON rental_payments
BEGIN
  INSERT INTO rental_payment_events (id, payment_id, actor_id, actor_name, action, reason, created_at)
  VALUES (lower(hex(randomblob(16))), NEW.id, NEW.submitted_by,
    (SELECT CASE WHEN NEW.submitted_by = b.owner_id THEN c.owner_name ELSE c.renter_name END FROM rental_bills b JOIN rental_connections c ON c.id = b.connection_id WHERE b.id = NEW.bill_id),
    CASE WHEN NEW.status = 'confirmed' THEN 'recorded' ELSE 'submitted' END, coalesce(NEW.duplicate_reason, ''), NEW.created_at);
END;
--> statement-breakpoint
CREATE TRIGGER rental_payment_changed AFTER UPDATE OF status ON rental_payments
BEGIN
  INSERT INTO rental_payment_events (id, payment_id, actor_id, actor_name, action, reason, created_at)
  VALUES (lower(hex(randomblob(16))), NEW.id, CASE WHEN NEW.status = 'reversed' THEN NEW.reversed_by ELSE NEW.reviewed_by END,
    (SELECT CASE WHEN NEW.status = 'cancelled' THEN c.renter_name ELSE c.owner_name END FROM rental_bills b JOIN rental_connections c ON c.id = b.connection_id WHERE b.id = NEW.bill_id),
    NEW.status, CASE WHEN NEW.status = 'reversed' THEN NEW.reversal_reason WHEN NEW.status = 'confirmed' THEN coalesce(NEW.duplicate_reason, '') ELSE NEW.decision_reason END,
    CASE WHEN NEW.status = 'reversed' THEN NEW.reversed_at ELSE NEW.reviewed_at END);
END;
