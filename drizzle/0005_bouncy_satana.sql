CREATE TABLE `rental_bill_schedules` (
	`connection_id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`status` text NOT NULL,
	`first_month` text NOT NULL,
	`next_month` text NOT NULL,
	`issue` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	`last_checked_at` text,
	`last_bill_id` text,
	FOREIGN KEY (`connection_id`) REFERENCES `rental_connections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`last_bill_id`) REFERENCES `rental_bills`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "rental_schedule_status" CHECK("rental_bill_schedules"."status" IN ('enabled','paused','attention','finished'))
);
--> statement-breakpoint
CREATE INDEX `rental_bill_schedules_due` ON `rental_bill_schedules` (`status`,`next_month`);--> statement-breakpoint
CREATE INDEX `rental_bill_schedules_owner` ON `rental_bill_schedules` (`owner_id`,`status`);--> statement-breakpoint
ALTER TABLE `rental_bills` ADD `source` text DEFAULT 'manual' NOT NULL;