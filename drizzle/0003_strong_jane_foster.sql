CREATE TABLE `rental_bill_events` (
	`id` text PRIMARY KEY NOT NULL,
	`bill_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`action` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`bill_id`) REFERENCES `rental_bills`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `rental_bill_events_bill` ON `rental_bill_events` (`bill_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `rental_bills` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`renter_id` text NOT NULL,
	`month` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`due_date` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'issued' NOT NULL,
	`created_at` text NOT NULL,
	`created_day` text NOT NULL,
	`voided_at` text,
	`void_reason` text,
	FOREIGN KEY (`connection_id`) REFERENCES `rental_connections`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "rental_bill_amount" CHECK("rental_bills"."amount_cents" BETWEEN 1 AND 100000000),
	CONSTRAINT "rental_bill_status" CHECK("rental_bills"."status" IN ('issued', 'voided'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rental_bill_live_month` ON `rental_bills` (`connection_id`,`month`) WHERE "rental_bills"."status" = 'issued';--> statement-breakpoint
CREATE INDEX `rental_bills_owner_month` ON `rental_bills` (`owner_id`,`month`,`due_date`);--> statement-breakpoint
CREATE INDEX `rental_bills_renter_month` ON `rental_bills` (`renter_id`,`month`,`due_date`);--> statement-breakpoint
CREATE INDEX `rental_bills_daily` ON `rental_bills` (`owner_id`,`created_day`);--> statement-breakpoint
CREATE INDEX `rental_bills_period` ON `rental_bills` (`connection_id`,`status`,`period_start`,`period_end`);
--> statement-breakpoint
-- Enforce shared parties, one current monthly bill and non-overlapping periods
-- in the same statement that saves a bill. API pre-checks alone can race.
CREATE TRIGGER rental_bill_insert BEFORE INSERT ON rental_bills
BEGIN
  SELECT CASE WHEN NEW.status <> 'issued' OR NEW.voided_at IS NOT NULL OR NEW.void_reason IS NOT NULL THEN RAISE(ABORT, 'RENTAL_BILL_STATE') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM rental_connections c WHERE c.id = NEW.connection_id AND c.status = 'accepted'
      AND c.owner_id = NEW.owner_id AND c.renter_id = NEW.renter_id AND c.renter_id IS NOT NULL
  ) THEN RAISE(ABORT, 'RENTAL_BILL_CONNECTION') END;
  SELECT CASE WHEN date(NEW.period_start, '+0 days') IS NOT NEW.period_start OR date(NEW.period_end, '+0 days') IS NOT NEW.period_end
    OR date(NEW.due_date, '+0 days') IS NOT NEW.due_date OR substr(NEW.period_start, 1, 7) <> NEW.month
    OR NEW.period_end < NEW.period_start OR julianday(NEW.period_end) - julianday(NEW.period_start) > 30
    OR NEW.period_start < (SELECT lease_start FROM rental_connections WHERE id = NEW.connection_id)
    OR NEW.period_end > (SELECT lease_end FROM rental_connections WHERE id = NEW.connection_id)
    THEN RAISE(ABORT, 'RENTAL_BILL_PERIOD') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM rental_bills WHERE connection_id = NEW.connection_id AND month = NEW.month AND status = 'issued') THEN RAISE(ABORT, 'RENTAL_BILL_MONTH') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM rental_bills b WHERE b.connection_id = NEW.connection_id AND b.status = 'issued'
      AND b.period_start <= NEW.period_end AND b.period_end >= NEW.period_start
  ) THEN RAISE(ABORT, 'RENTAL_BILL_OVERLAP') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM rental_bills) >= 10000 THEN RAISE(ABORT, 'RENTAL_BILLS_FULL') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM rental_bills WHERE owner_id = NEW.owner_id AND created_day = NEW.created_day) >= 60 THEN RAISE(ABORT, 'RENTAL_BILLS_DAILY') END;
END;
--> statement-breakpoint
CREATE TRIGGER rental_bill_immutable BEFORE UPDATE ON rental_bills
WHEN NEW.id IS NOT OLD.id OR NEW.connection_id IS NOT OLD.connection_id OR NEW.owner_id IS NOT OLD.owner_id OR NEW.renter_id IS NOT OLD.renter_id
  OR NEW.month IS NOT OLD.month OR NEW.period_start IS NOT OLD.period_start OR NEW.period_end IS NOT OLD.period_end OR NEW.due_date IS NOT OLD.due_date
  OR NEW.amount_cents IS NOT OLD.amount_cents OR NEW.note IS NOT OLD.note OR NEW.created_at IS NOT OLD.created_at OR NEW.created_day IS NOT OLD.created_day
BEGIN SELECT RAISE(ABORT, 'RENTAL_BILL_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER rental_bill_state BEFORE UPDATE ON rental_bills
WHEN NOT (OLD.status = 'issued' AND NEW.status = 'voided' AND NEW.voided_at IS NOT NULL AND NEW.void_reason IS NOT NULL
  AND length(trim(NEW.void_reason)) BETWEEN 5 AND 400)
BEGIN SELECT RAISE(ABORT, 'RENTAL_BILL_STATE'); END;
--> statement-breakpoint
CREATE TRIGGER rental_bill_created AFTER INSERT ON rental_bills
BEGIN
  INSERT INTO rental_bill_events (id, bill_id, actor_id, actor_name, action, reason, created_at)
  VALUES (lower(hex(randomblob(16))), NEW.id, NEW.owner_id, (SELECT owner_name FROM rental_connections WHERE id = NEW.connection_id), 'created', '', NEW.created_at);
END;
--> statement-breakpoint
CREATE TRIGGER rental_bill_voided AFTER UPDATE OF status ON rental_bills
BEGIN
  INSERT INTO rental_bill_events (id, bill_id, actor_id, actor_name, action, reason, created_at)
  VALUES (lower(hex(randomblob(16))), NEW.id, NEW.owner_id, (SELECT owner_name FROM rental_connections WHERE id = NEW.connection_id), 'voided', NEW.void_reason, NEW.voided_at);
END;
