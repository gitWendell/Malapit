CREATE INDEX `notifications_created` ON `app_notifications` (`created_at`);--> statement-breakpoint
CREATE INDEX `rental_bills_notification_due` ON `rental_bills` (`status`,`due_date`);