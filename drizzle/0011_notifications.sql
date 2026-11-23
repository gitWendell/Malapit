CREATE TABLE `app_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`recipient_email` text,
	`kind` text NOT NULL,
	`target_id` text NOT NULL,
	`created_at` text NOT NULL,
	`read_at` text,
	CONSTRAINT "notification_recipient" CHECK("app_notifications"."user_id" IS NOT NULL OR "app_notifications"."recipient_email" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX `notifications_user` ON `app_notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_email` ON `app_notifications` (`recipient_email`,`created_at`);--> statement-breakpoint
CREATE TABLE `push_deliveries` (
	`notification_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text NOT NULL,
	`lease_until` text,
	`sent_at` text,
	`failed_at` text,
	PRIMARY KEY(`notification_id`, `subscription_id`),
	FOREIGN KEY (`notification_id`) REFERENCES `app_notifications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subscription_id`) REFERENCES `push_subscriptions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `push_delivery_queue` ON `push_deliveries` (`sent_at`,`failed_at`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_user` ON `push_subscriptions` (`user_id`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_email` ON `push_subscriptions` (`email`);
--> statement-breakpoint
CREATE TRIGGER notify_inquiry AFTER INSERT ON inquiries
WHEN (SELECT count(*) FROM app_notifications)<10000 AND (NEW.is_demo=0)
BEGIN
 INSERT OR IGNORE INTO app_notifications(id,user_id,recipient_email,kind,target_id,created_at) SELECT 'inquiry:'||NEW.id,NEW.owner_id,NULL,'inquiry',NEW.id,NEW.created_at  WHERE 1;
END;

--> statement-breakpoint
CREATE TRIGGER notify_message AFTER INSERT ON inquiry_messages
WHEN (SELECT count(*) FROM app_notifications)<10000 AND (NEW.role IN ('owner','renter') AND EXISTS(SELECT 1 FROM inquiries WHERE id=NEW.inquiry_id AND is_demo=0))
BEGIN
 INSERT OR IGNORE INTO app_notifications(id,user_id,recipient_email,kind,target_id,created_at) SELECT 'message:'||NEW.id,CASE WHEN NEW.sender_id=i.owner_id THEN i.renter_id ELSE i.owner_id END,NULL,'message',NEW.inquiry_id,NEW.created_at FROM inquiries i WHERE i.id=NEW.inquiry_id;
END;

--> statement-breakpoint
CREATE TRIGGER notify_invitation AFTER INSERT ON rental_connections
WHEN (SELECT count(*) FROM app_notifications)<10000 AND (NEW.status='pending')
BEGIN
 INSERT OR IGNORE INTO app_notifications(id,user_id,recipient_email,kind,target_id,created_at) VALUES('invitation:'||NEW.id,NULL,lower(trim(NEW.invite_email)),'invitation',NEW.id,NEW.created_at);
END;

--> statement-breakpoint
CREATE TRIGGER notify_offer_target AFTER INSERT ON inquiry_rental_offers
BEGIN
 UPDATE app_notifications SET user_id=NEW.target_renter_id,recipient_email=NULL WHERE id='invitation:'||NEW.connection_id;
END;

--> statement-breakpoint
CREATE TRIGGER notify_connection_response AFTER UPDATE OF status ON rental_connections
WHEN (SELECT count(*) FROM app_notifications)<10000 AND (OLD.status='pending' AND NEW.status IN ('accepted','declined'))
BEGIN
 UPDATE app_notifications SET user_id=NEW.renter_id,recipient_email=NULL,read_at=NEW.responded_at WHERE id='invitation:'||NEW.id;
 INSERT OR IGNORE INTO app_notifications(id,user_id,recipient_email,kind,target_id,created_at) VALUES(NEW.status||':'||NEW.id,NEW.owner_id,NULL,NEW.status,NEW.id,NEW.responded_at);
END;

--> statement-breakpoint
CREATE TRIGGER notify_connection_revoked AFTER UPDATE OF status ON rental_connections
WHEN (SELECT count(*) FROM app_notifications)<10000 AND (OLD.status='pending' AND NEW.status='revoked')
BEGIN
 INSERT OR IGNORE INTO app_notifications(id,user_id,recipient_email,kind,target_id,created_at) SELECT 'revoked:'||NEW.id,n.user_id,n.recipient_email,'revoked',NEW.id,NEW.responded_at FROM app_notifications n WHERE n.id='invitation:'||NEW.id;
END;

--> statement-breakpoint
CREATE TRIGGER notify_connection_ended AFTER UPDATE OF status ON rental_connections
WHEN (SELECT count(*) FROM app_notifications)<10000 AND (OLD.status='accepted' AND NEW.status='ended')
BEGIN
 INSERT OR IGNORE INTO app_notifications(id,user_id,recipient_email,kind,target_id,created_at) SELECT 'ended:'||NEW.id,CASE WHEN NEW.ended_by=NEW.owner_id THEN NEW.renter_id ELSE NEW.owner_id END,NULL,'ended',NEW.id,NEW.ended_at  WHERE 1;
END;

--> statement-breakpoint
CREATE TRIGGER notify_bill AFTER INSERT ON rental_bills
WHEN (SELECT count(*) FROM app_notifications)<10000 AND (NEW.status='issued')
BEGIN
 INSERT OR IGNORE INTO app_notifications(id,user_id,recipient_email,kind,target_id,created_at) SELECT 'bill:'||NEW.id,NEW.renter_id,NULL,'bill',NEW.id,NEW.created_at  WHERE 1;
END;

--> statement-breakpoint
CREATE TRIGGER notify_bill_voided AFTER UPDATE OF status ON rental_bills
WHEN (SELECT count(*) FROM app_notifications)<10000 AND (OLD.status='issued' AND NEW.status='voided')
BEGIN
 INSERT OR IGNORE INTO app_notifications(id,user_id,recipient_email,kind,target_id,created_at) SELECT 'bill-voided:'||NEW.id,NEW.renter_id,NULL,'bill_voided',NEW.id,NEW.voided_at  WHERE 1;
END;

--> statement-breakpoint
CREATE TRIGGER notify_payment_report AFTER INSERT ON rental_payments
WHEN (SELECT count(*) FROM app_notifications)<10000 AND (NEW.status='pending')
BEGIN
 INSERT OR IGNORE INTO app_notifications(id,user_id,recipient_email,kind,target_id,created_at) SELECT 'payment-reported:'||NEW.id,NEW.owner_id,NULL,'payment_reported',NEW.bill_id,NEW.created_at  WHERE 1;
END;

--> statement-breakpoint
CREATE TRIGGER notify_owner_receipt AFTER INSERT ON rental_payments
WHEN (SELECT count(*) FROM app_notifications)<10000 AND (NEW.status='confirmed')
BEGIN
 INSERT OR IGNORE INTO app_notifications(id,user_id,recipient_email,kind,target_id,created_at) SELECT 'payment-confirmed:'||NEW.id,NEW.renter_id,NULL,'payment_confirmed',NEW.bill_id,NEW.created_at  WHERE 1;
END;

--> statement-breakpoint
CREATE TRIGGER notify_payment_confirmed AFTER UPDATE OF status ON rental_payments
WHEN (SELECT count(*) FROM app_notifications)<10000 AND (OLD.status<>NEW.status AND NEW.status='confirmed')
BEGIN
 INSERT OR IGNORE INTO app_notifications(id,user_id,recipient_email,kind,target_id,created_at) SELECT 'payment-confirmed:'||NEW.id,NEW.renter_id,NULL,'payment_confirmed',NEW.bill_id,NEW.reviewed_at  WHERE 1;
END;

--> statement-breakpoint
CREATE TRIGGER notify_payment_rejected AFTER UPDATE OF status ON rental_payments
WHEN (SELECT count(*) FROM app_notifications)<10000 AND (OLD.status<>NEW.status AND NEW.status='rejected')
BEGIN
 INSERT OR IGNORE INTO app_notifications(id,user_id,recipient_email,kind,target_id,created_at) SELECT 'payment-rejected:'||NEW.id,NEW.renter_id,NULL,'payment_rejected',NEW.bill_id,NEW.reviewed_at  WHERE 1;
END;

--> statement-breakpoint
CREATE TRIGGER notify_payment_reversed AFTER UPDATE OF status ON rental_payments
WHEN (SELECT count(*) FROM app_notifications)<10000 AND (OLD.status<>NEW.status AND NEW.status='reversed')
BEGIN
 INSERT OR IGNORE INTO app_notifications(id,user_id,recipient_email,kind,target_id,created_at) SELECT 'payment-reversed:'||NEW.id,NEW.renter_id,NULL,'payment_reversed',NEW.bill_id,NEW.reversed_at  WHERE 1;
END;
