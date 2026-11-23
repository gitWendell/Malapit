CREATE TABLE `owner_payment_methods` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`account_name` text DEFAULT '' NOT NULL,
	`account_number` text DEFAULT '' NOT NULL,
	`instructions` text DEFAULT '' NOT NULL,
	`qr_image_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`qr_image_id`) REFERENCES `owner_payment_qrs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "owner_payment_method_kind" CHECK("owner_payment_methods"."kind" IN ('gcash','maya','bank','qr','cash','other'))
);
--> statement-breakpoint
CREATE INDEX `owner_payment_methods_owner` ON `owner_payment_methods` (`owner_id`,`archived_at`);--> statement-breakpoint
CREATE TABLE `owner_payment_qrs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`data` text NOT NULL,
	`byte_size` integer NOT NULL,
	`checksum` text NOT NULL,
	`created_at` text NOT NULL,
	`created_day` text NOT NULL,
	CONSTRAINT "owner_payment_qr_bytes" CHECK("owner_payment_qrs"."byte_size" BETWEEN 45 AND 204800)
);
--> statement-breakpoint
CREATE INDEX `owner_payment_qrs_owner` ON `owner_payment_qrs` (`owner_id`,`created_day`);--> statement-breakpoint
ALTER TABLE `rental_payments` ADD `destination_id` text;--> statement-breakpoint
ALTER TABLE `rental_payments` ADD `destination_snapshot` text;
--> statement-breakpoint
CREATE TRIGGER owner_payment_qr_insert BEFORE INSERT ON owner_payment_qrs
BEGIN
 SELECT CASE WHEN (SELECT count(*) FROM owner_payment_qrs)>=250 OR (SELECT coalesce(sum(byte_size),0) FROM owner_payment_qrs)+NEW.byte_size>33554432 OR (SELECT count(*) FROM owner_payment_qrs WHERE owner_id=NEW.owner_id)>=20 THEN RAISE(ABORT,'OWNER_QR_STORAGE') END;
 SELECT CASE WHEN (SELECT count(*) FROM owner_payment_qrs WHERE owner_id=NEW.owner_id AND created_day=NEW.created_day)>=5 THEN RAISE(ABORT,'OWNER_QR_DAILY') END;
END;
--> statement-breakpoint
CREATE TRIGGER owner_payment_qr_immutable BEFORE UPDATE ON owner_payment_qrs
BEGIN SELECT RAISE(ABORT,'OWNER_QR_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER owner_payment_method_insert BEFORE INSERT ON owner_payment_methods
BEGIN
 SELECT CASE WHEN (SELECT count(*) FROM owner_payment_methods)>=2000 OR (SELECT count(*) FROM owner_payment_methods WHERE owner_id=NEW.owner_id)>=100 OR (SELECT count(*) FROM owner_payment_methods WHERE owner_id=NEW.owner_id AND archived_at IS NULL)>=10 THEN RAISE(ABORT,'OWNER_METHOD_LIMIT') END;
 SELECT CASE WHEN NEW.qr_image_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM owner_payment_qrs q WHERE q.id=NEW.qr_image_id AND q.owner_id=NEW.owner_id) THEN RAISE(ABORT,'OWNER_QR_SCOPE') END;
END;
--> statement-breakpoint
CREATE TRIGGER owner_payment_method_update BEFORE UPDATE ON owner_payment_methods
BEGIN
 SELECT CASE WHEN NEW.id IS NOT OLD.id OR NEW.owner_id IS NOT OLD.owner_id OR NEW.created_at IS NOT OLD.created_at OR OLD.archived_at IS NOT NULL THEN RAISE(ABORT,'OWNER_METHOD_IMMUTABLE') END;
 SELECT CASE WHEN NEW.qr_image_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM owner_payment_qrs q WHERE q.id=NEW.qr_image_id AND q.owner_id=NEW.owner_id) THEN RAISE(ABORT,'OWNER_QR_SCOPE') END;
END;
--> statement-breakpoint
CREATE TRIGGER rental_payment_destination_insert BEFORE INSERT ON rental_payments
WHEN NEW.destination_id IS NOT NULL OR NEW.destination_snapshot IS NOT NULL
BEGIN
 SELECT CASE WHEN NEW.destination_id IS NULL OR NEW.destination_snapshot IS NULL OR NOT json_valid(NEW.destination_snapshot) THEN RAISE(ABORT,'RENTAL_DESTINATION_CHANGED') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM owner_payment_methods m
 WHERE m.id=NEW.destination_id AND m.owner_id=NEW.owner_id AND m.archived_at IS NULL
 AND json_extract(NEW.destination_snapshot,'$.id') IS m.id
 AND json_extract(NEW.destination_snapshot,'$.updatedAt') IS m.updated_at
 AND json_extract(NEW.destination_snapshot,'$.kind') IS m.kind
 AND json_extract(NEW.destination_snapshot,'$.label') IS m.label
 AND json_extract(NEW.destination_snapshot,'$.accountName') IS m.account_name
 AND json_extract(NEW.destination_snapshot,'$.accountNumber') IS m.account_number
 AND json_extract(NEW.destination_snapshot,'$.instructions') IS m.instructions
 AND json_extract(NEW.destination_snapshot,'$.qrImageId') IS m.qr_image_id
 AND NEW.method=(CASE WHEN m.kind='qr' THEN 'other' ELSE m.kind END)
 ) THEN RAISE(ABORT,'RENTAL_DESTINATION_CHANGED') END;
END;
--> statement-breakpoint
CREATE TRIGGER rental_payment_destination_immutable BEFORE UPDATE ON rental_payments
WHEN NEW.destination_id IS NOT OLD.destination_id OR NEW.destination_snapshot IS NOT OLD.destination_snapshot
BEGIN SELECT RAISE(ABORT,'RENTAL_PAYMENT_IMMUTABLE'); END;
