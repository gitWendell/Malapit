CREATE TABLE `hitpay_sandbox_checkouts` (
	`id` text PRIMARY KEY NOT NULL,
	`bill_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`renter_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`business_id` text NOT NULL,
	`provider_id` text,
	`checkout_url` text,
	`status` text DEFAULT 'creating' NOT NULL,
	`amount_cents` integer DEFAULT 100 NOT NULL,
	`currency` text DEFAULT 'SGD' NOT NULL,
	`created_at` text NOT NULL,
	`created_day` text NOT NULL,
	`updated_at` text NOT NULL,
	`verified_at` text,
	FOREIGN KEY (`bill_id`) REFERENCES `rental_bills`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "hitpay_sandbox_fixed_amount" CHECK("hitpay_sandbox_checkouts"."amount_cents"=100 AND "hitpay_sandbox_checkouts"."currency"='SGD'),
	CONSTRAINT "hitpay_sandbox_status" CHECK("hitpay_sandbox_checkouts"."status" IN ('creating','pending','unknown','completed','failed','expired','canceled','inactive'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hitpay_sandbox_checkouts_provider_id_unique` ON `hitpay_sandbox_checkouts` (`provider_id`);--> statement-breakpoint
CREATE INDEX `hitpay_sandbox_bill` ON `hitpay_sandbox_checkouts` (`bill_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `hitpay_sandbox_daily` ON `hitpay_sandbox_checkouts` (`actor_id`,`created_day`);--> statement-breakpoint
CREATE UNIQUE INDEX `hitpay_sandbox_open_bill` ON `hitpay_sandbox_checkouts` (`bill_id`) WHERE "hitpay_sandbox_checkouts"."status" IN ('creating','pending','unknown');--> statement-breakpoint
CREATE TRIGGER hitpay_sandbox_insert BEFORE INSERT ON hitpay_sandbox_checkouts
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM rental_bills b WHERE b.id=NEW.bill_id AND b.owner_id=NEW.owner_id AND b.renter_id=NEW.renter_id AND b.status='issued' AND NEW.actor_id IN(b.owner_id,b.renter_id)) THEN RAISE(ABORT,'HITPAY_SANDBOX_SCOPE') END;
 SELECT CASE WHEN (SELECT count(*) FROM hitpay_sandbox_checkouts)>=1000 OR (SELECT count(*) FROM hitpay_sandbox_checkouts WHERE actor_id=NEW.actor_id AND created_day=NEW.created_day)>=10 THEN RAISE(ABORT,'HITPAY_SANDBOX_LIMIT') END;
END;

--> statement-breakpoint
CREATE TRIGGER hitpay_sandbox_immutable BEFORE UPDATE ON hitpay_sandbox_checkouts
WHEN NEW.id IS NOT OLD.id OR NEW.bill_id IS NOT OLD.bill_id
 OR NEW.owner_id IS NOT OLD.owner_id OR NEW.renter_id IS NOT OLD.renter_id
 OR NEW.actor_id IS NOT OLD.actor_id OR NEW.business_id IS NOT OLD.business_id
 OR NEW.amount_cents IS NOT OLD.amount_cents OR NEW.currency IS NOT OLD.currency
 OR NEW.created_at IS NOT OLD.created_at OR NEW.created_day IS NOT OLD.created_day
 OR (OLD.provider_id IS NOT NULL AND NEW.provider_id IS NOT OLD.provider_id)
 OR (OLD.status='completed' AND NEW.status<>'completed')
BEGIN
 SELECT RAISE(ABORT,'HITPAY_SANDBOX_IMMUTABLE');
END;
