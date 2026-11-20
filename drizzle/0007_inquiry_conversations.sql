CREATE TABLE `inquiry_messages` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`inquiry_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`sender_name` text NOT NULL,
	`role` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	`created_day` text NOT NULL,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "inquiry_message_role" CHECK("inquiry_messages"."role" IN ('owner','renter','reviewer')),
	CONSTRAINT "inquiry_message_body" CHECK(length(trim("inquiry_messages"."body")) BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inquiry_messages_id_unique` ON `inquiry_messages` (`id`);--> statement-breakpoint
CREATE INDEX `inquiry_messages_thread` ON `inquiry_messages` (`inquiry_id`,`seq`);--> statement-breakpoint
CREATE INDEX `inquiry_messages_sender_day` ON `inquiry_messages` (`sender_id`,`created_day`);
--> statement-breakpoint
CREATE TRIGGER inquiry_message_limits BEFORE INSERT ON inquiry_messages
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM inquiries i WHERE i.id=NEW.inquiry_id AND
    ((NEW.role='owner' AND NEW.sender_id=i.owner_id) OR (NEW.role='renter' AND NEW.sender_id=i.renter_id) OR NEW.role='reviewer'))
    THEN RAISE(ABORT,'INQUIRY_MESSAGE_PARTY') END;
  SELECT CASE WHEN (SELECT count(*) FROM inquiry_messages)>=20000 THEN RAISE(ABORT,'INQUIRY_MESSAGES_FULL') END;
  SELECT CASE WHEN (SELECT count(*) FROM inquiry_messages WHERE sender_id=NEW.sender_id AND created_day=NEW.created_day)>=100
    THEN RAISE(ABORT,'INQUIRY_MESSAGES_DAILY') END;
END;
--> statement-breakpoint
CREATE TRIGGER inquiry_message_immutable BEFORE UPDATE ON inquiry_messages
BEGIN
  SELECT RAISE(ABORT,'INQUIRY_MESSAGE_IMMUTABLE');
END;
