CREATE TABLE `inquiry_rental_offers` (
	`connection_id` text PRIMARY KEY NOT NULL,
	`inquiry_id` text NOT NULL,
	`target_renter_id` text NOT NULL,
	`first_bill_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`due_date` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `rental_connections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "inquiry_rental_offer_amount" CHECK("inquiry_rental_offers"."amount_cents" BETWEEN 1 AND 100000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inquiry_rental_offers_first_bill_id_unique` ON `inquiry_rental_offers` (`first_bill_id`);--> statement-breakpoint
CREATE INDEX `inquiry_rental_offer_thread` ON `inquiry_rental_offers` (`inquiry_id`);--> statement-breakpoint
CREATE TABLE `rental_listing_units` (
	`listing_id` text PRIMARY KEY NOT NULL,
	`unit_id` text NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`unit_id`) REFERENCES `rental_units`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rental_listing_units_unit_id_unique` ON `rental_listing_units` (`unit_id`);--> statement-breakpoint
CREATE TRIGGER rental_listing_unit_insert BEFORE INSERT ON rental_listing_units
WHEN NOT EXISTS (SELECT 1 FROM listings l JOIN rental_units u ON u.owner_id=l.owner_id WHERE l.id=NEW.listing_id AND u.id=NEW.unit_id)
BEGIN SELECT RAISE(ABORT,'RENTAL_OFFER_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER inquiry_rental_offer_insert BEFORE INSERT ON inquiry_rental_offers
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM inquiries i JOIN listings l ON l.id=i.listing_id
  JOIN rental_listing_units lu ON lu.listing_id=l.id JOIN rental_connections c ON c.unit_id=lu.unit_id
  WHERE i.id=NEW.inquiry_id AND i.is_demo=0 AND i.renter_id=NEW.target_renter_id AND i.owner_id=c.owner_id
  AND l.owner_id=c.owner_id AND c.id=NEW.connection_id AND c.status='pending'
  AND c.invite_email=lower(trim(i.renter_email)) AND c.owner_id<>i.renter_id AND l.status IN ('published','paused')
  AND NEW.period_start=c.lease_start AND NEW.period_end>=NEW.period_start
  AND julianday(NEW.period_end)-julianday(NEW.period_start)<=30
  AND date(NEW.period_start,'+0 days') IS NEW.period_start AND date(NEW.period_end,'+0 days') IS NEW.period_end
  AND date(NEW.due_date,'+0 days') IS NEW.due_date AND (c.lease_end IS NULL OR NEW.period_end<=c.lease_end)
 ) THEN RAISE(ABORT,'RENTAL_OFFER_INVALID') END;
END;
--> statement-breakpoint
CREATE TRIGGER inquiry_rental_offer_immutable BEFORE UPDATE ON inquiry_rental_offers
BEGIN SELECT RAISE(ABORT,'RENTAL_TERMS_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER inquiry_rental_offer_target BEFORE UPDATE OF status ON rental_connections
WHEN NEW.status IN ('accepted','declined') AND EXISTS(SELECT 1 FROM inquiry_rental_offers o WHERE o.connection_id=NEW.id AND o.target_renter_id<>NEW.renter_id)
BEGIN SELECT RAISE(ABORT,'RENTAL_OFFER_TARGET'); END;
--> statement-breakpoint
-- Acceptance, first bill and map availability succeed or roll back together.
CREATE TRIGGER inquiry_rental_offer_accepted AFTER UPDATE OF status ON rental_connections
WHEN OLD.status='pending' AND NEW.status='accepted' AND EXISTS(SELECT 1 FROM inquiry_rental_offers WHERE connection_id=NEW.id)
BEGIN
 INSERT INTO rental_bills(id,connection_id,owner_id,renter_id,month,period_start,period_end,due_date,amount_cents,note,created_at,created_day)
 SELECT o.first_bill_id,NEW.id,NEW.owner_id,NEW.renter_id,substr(o.period_start,1,7),o.period_start,o.period_end,o.due_date,o.amount_cents,o.note,NEW.responded_at,strftime('%Y-%m-%d',NEW.responded_at,'+8 hours') FROM inquiry_rental_offers o WHERE o.connection_id=NEW.id;
 UPDATE listings SET status='rented' WHERE id=(SELECT i.listing_id FROM inquiries i JOIN inquiry_rental_offers o ON o.inquiry_id=i.id WHERE o.connection_id=NEW.id) AND owner_id=NEW.owner_id;
END;
