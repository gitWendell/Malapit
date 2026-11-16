CREATE TABLE `rental_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`unit_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`owner_name` text NOT NULL,
	`owner_email` text NOT NULL,
	`invite_email` text NOT NULL,
	`renter_id` text,
	`renter_name` text,
	`renter_email` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`property_name` text NOT NULL,
	`unit_name` text NOT NULL,
	`city` text NOT NULL,
	`address` text NOT NULL,
	`monthly_rent_cents` integer NOT NULL,
	`due_day` integer NOT NULL,
	`lease_start` text NOT NULL,
	`lease_end` text,
	`created_at` text NOT NULL,
	`created_day` text NOT NULL,
	`expires_at` text NOT NULL,
	`responded_at` text,
	`ended_at` text,
	`ended_by` text,
	FOREIGN KEY (`unit_id`) REFERENCES `rental_units`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "rental_connection_status" CHECK("rental_connections"."status" IN ('pending', 'accepted', 'declined', 'revoked', 'expired', 'ended')),
	CONSTRAINT "rental_connection_rent" CHECK("rental_connections"."monthly_rent_cents" BETWEEN 10000 AND 100000000 AND "rental_connections"."due_day" BETWEEN 1 AND 31),
	CONSTRAINT "rental_connection_parties" CHECK("rental_connections"."renter_id" IS NULL OR "rental_connections"."renter_id" <> "rental_connections"."owner_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rental_connection_live_unit` ON `rental_connections` (`unit_id`) WHERE "rental_connections"."status" IN ('pending', 'accepted');--> statement-breakpoint
CREATE INDEX `rental_connections_owner` ON `rental_connections` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `rental_connections_email` ON `rental_connections` (`invite_email`,`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `rental_connections_renter` ON `rental_connections` (`renter_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `rental_connections_daily` ON `rental_connections` (`owner_id`,`created_day`);--> statement-breakpoint
CREATE TABLE `rental_events` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`action` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `rental_connections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `rental_events_connection` ON `rental_events` (`connection_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `rental_units` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`property_name` text NOT NULL,
	`unit_name` text NOT NULL,
	`city` text NOT NULL,
	`address` text NOT NULL,
	`monthly_rent_cents` integer NOT NULL,
	`due_day` integer NOT NULL,
	`lease_start` text NOT NULL,
	`lease_end` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived_at` text,
	CONSTRAINT "rental_unit_rent" CHECK("rental_units"."monthly_rent_cents" BETWEEN 10000 AND 100000000 AND "rental_units"."due_day" BETWEEN 1 AND 31)
);
--> statement-breakpoint
CREATE INDEX `rental_units_owner` ON `rental_units` (`owner_id`,`created_at`);
-- Private rentals use separate tables and never publish a map listing.
-- Statement-level triggers preserve limits and invitation state under races.
CREATE TRIGGER rental_units_limit_insert BEFORE INSERT ON rental_units
WHEN NEW.archived_at IS NULL
BEGIN
  SELECT CASE WHEN (SELECT COUNT(*) FROM rental_units WHERE archived_at IS NULL) >= 100 THEN RAISE(ABORT, 'RENTAL_UNITS_FULL') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM rental_units WHERE owner_id = NEW.owner_id AND archived_at IS NULL) >= 30 THEN RAISE(ABORT, 'RENTAL_OWNER_LIMIT') END;
END;
--> statement-breakpoint
CREATE TRIGGER rental_units_limit_restore BEFORE UPDATE OF archived_at ON rental_units
WHEN OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL
BEGIN
  SELECT CASE WHEN (SELECT COUNT(*) FROM rental_units WHERE archived_at IS NULL) >= 100 THEN RAISE(ABORT, 'RENTAL_UNITS_FULL') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM rental_units WHERE owner_id = NEW.owner_id AND archived_at IS NULL) >= 30 THEN RAISE(ABORT, 'RENTAL_OWNER_LIMIT') END;
END;
--> statement-breakpoint
CREATE TRIGGER rental_units_identity BEFORE UPDATE ON rental_units
WHEN NEW.owner_id IS NOT OLD.owner_id OR NEW.created_at IS NOT OLD.created_at OR NEW.id IS NOT OLD.id
BEGIN SELECT RAISE(ABORT, 'RENTAL_UNIT_IDENTITY'); END;
--> statement-breakpoint
CREATE TRIGGER rental_units_locked BEFORE UPDATE ON rental_units
WHEN EXISTS (SELECT 1 FROM rental_connections WHERE unit_id = OLD.id AND (status = 'accepted' OR (status = 'pending' AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))))
BEGIN SELECT RAISE(ABORT, 'RENTAL_UNIT_LOCKED'); END;
--> statement-breakpoint
CREATE TRIGGER rental_connection_insert BEFORE INSERT ON rental_connections
BEGIN
  SELECT CASE WHEN NEW.status <> 'pending' OR NEW.renter_id IS NOT NULL OR NEW.renter_name IS NOT NULL OR NEW.renter_email IS NOT NULL OR NEW.responded_at IS NOT NULL OR NEW.ended_at IS NOT NULL OR NEW.ended_by IS NOT NULL
    THEN RAISE(ABORT, 'RENTAL_CONNECTION_STATE') END;
  SELECT CASE WHEN lower(NEW.owner_email) = NEW.invite_email OR NEW.invite_email <> lower(trim(NEW.invite_email))
    THEN RAISE(ABORT, 'RENTAL_INVITE_EMAIL') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM rental_units u WHERE u.id = NEW.unit_id AND u.owner_id = NEW.owner_id AND u.archived_at IS NULL
      AND u.property_name = NEW.property_name AND u.unit_name = NEW.unit_name AND u.city = NEW.city AND u.address = NEW.address
      AND u.monthly_rent_cents = NEW.monthly_rent_cents AND u.due_day = NEW.due_day AND u.lease_start = NEW.lease_start AND u.lease_end IS NEW.lease_end
  ) THEN RAISE(ABORT, 'RENTAL_UNIT_CHANGED') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM rental_connections WHERE owner_id = NEW.owner_id AND created_day = NEW.created_day) >= 30
    THEN RAISE(ABORT, 'RENTAL_INVITES_DAILY') END;
END;
--> statement-breakpoint
CREATE TRIGGER rental_connection_snapshot BEFORE UPDATE ON rental_connections
WHEN NEW.id IS NOT OLD.id OR NEW.unit_id IS NOT OLD.unit_id OR NEW.owner_id IS NOT OLD.owner_id OR NEW.owner_name IS NOT OLD.owner_name
  OR NEW.owner_email IS NOT OLD.owner_email OR NEW.invite_email IS NOT OLD.invite_email
  OR NEW.property_name IS NOT OLD.property_name OR NEW.unit_name IS NOT OLD.unit_name OR NEW.city IS NOT OLD.city OR NEW.address IS NOT OLD.address
  OR NEW.monthly_rent_cents IS NOT OLD.monthly_rent_cents OR NEW.due_day IS NOT OLD.due_day OR NEW.lease_start IS NOT OLD.lease_start OR NEW.lease_end IS NOT OLD.lease_end
  OR NEW.created_at IS NOT OLD.created_at OR NEW.created_day IS NOT OLD.created_day OR NEW.expires_at IS NOT OLD.expires_at
BEGIN SELECT RAISE(ABORT, 'RENTAL_TERMS_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER rental_connection_state BEFORE UPDATE ON rental_connections
WHEN NOT (
  (OLD.status = 'pending' AND NEW.status IN ('accepted', 'declined') AND OLD.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    AND NEW.renter_id IS NOT NULL AND NEW.renter_id <> NEW.owner_id AND NEW.renter_name IS NOT NULL AND NEW.renter_email IS NOT NULL AND lower(NEW.renter_email) = OLD.invite_email
    AND NEW.responded_at IS NOT NULL AND NEW.ended_at IS NULL AND NEW.ended_by IS NULL)
  OR (OLD.status = 'pending' AND NEW.status IN ('revoked', 'expired') AND NEW.renter_id IS NULL AND NEW.renter_name IS NULL AND NEW.renter_email IS NULL
    AND NEW.responded_at IS NOT NULL AND NEW.ended_at IS NULL AND NEW.ended_by IS NULL
    AND (NEW.status = 'revoked' OR OLD.expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))
  OR (OLD.status = 'accepted' AND NEW.status = 'ended' AND NEW.renter_id IS OLD.renter_id AND NEW.renter_name IS OLD.renter_name AND NEW.renter_email IS OLD.renter_email
    AND NEW.responded_at IS OLD.responded_at AND NEW.ended_at IS NOT NULL AND NEW.ended_by IS NOT NULL AND NEW.ended_by IN (OLD.owner_id, OLD.renter_id))
)
BEGIN SELECT RAISE(ABORT, 'RENTAL_CONNECTION_STATE'); END;
--> statement-breakpoint
CREATE TRIGGER rental_event_invited AFTER INSERT ON rental_connections
BEGIN
  INSERT INTO rental_events (id, connection_id, actor_id, actor_name, action, created_at)
  VALUES (lower(hex(randomblob(16))), NEW.id, NEW.owner_id, NEW.owner_name, 'invited', NEW.created_at);
END;
--> statement-breakpoint
CREATE TRIGGER rental_event_changed AFTER UPDATE OF status ON rental_connections
BEGIN
  INSERT INTO rental_events (id, connection_id, actor_id, actor_name, action, created_at)
  VALUES (
    lower(hex(randomblob(16))), NEW.id,
    CASE WHEN NEW.status IN ('accepted', 'declined') THEN NEW.renter_id WHEN NEW.status = 'ended' THEN NEW.ended_by WHEN NEW.status = 'expired' THEN 'system' ELSE NEW.owner_id END,
    CASE WHEN NEW.status IN ('accepted', 'declined') THEN NEW.renter_name WHEN NEW.status = 'expired' THEN 'Malapit' WHEN NEW.status = 'ended' AND NEW.ended_by = NEW.renter_id THEN NEW.renter_name ELSE NEW.owner_name END,
    NEW.status, CASE WHEN NEW.status = 'ended' THEN NEW.ended_at ELSE NEW.responded_at END
  );
END;
