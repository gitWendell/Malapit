CREATE TABLE `inquiry_viewing_events` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`viewing_id` text NOT NULL,
	`action` text NOT NULL,
	`actor_id` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`viewing_id`) REFERENCES `inquiry_viewings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `inquiry_viewing_events_viewing` ON `inquiry_viewing_events` (`viewing_id`,`seq`);--> statement-breakpoint
CREATE TABLE `inquiry_viewings` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`inquiry_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`renter_id` text NOT NULL,
	`proposed_by` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_by` text NOT NULL,
	`decision_note` text DEFAULT '' NOT NULL,
	`replaces_id` text,
	`created_at` text NOT NULL,
	`created_day` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "inquiry_viewing_status" CHECK("inquiry_viewings"."status" IN ('proposed','confirmed','completed','declined','cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inquiry_viewings_id_unique` ON `inquiry_viewings` (`id`);--> statement-breakpoint
CREATE INDEX `inquiry_viewings_thread` ON `inquiry_viewings` (`inquiry_id`,`seq`);--> statement-breakpoint
CREATE INDEX `inquiry_viewings_daily` ON `inquiry_viewings` (`proposed_by`,`created_day`);--> statement-breakpoint
CREATE INDEX `inquiry_viewings_owner_time` ON `inquiry_viewings` (`owner_id`,`status`,`starts_at`);--> statement-breakpoint
CREATE INDEX `inquiry_viewings_renter_time` ON `inquiry_viewings` (`renter_id`,`status`,`starts_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `inquiry_viewings_active` ON `inquiry_viewings` (`inquiry_id`) WHERE "inquiry_viewings"."status" IN ('proposed','confirmed');
--> statement-breakpoint
CREATE UNIQUE INDEX inquiry_viewings_replacement ON inquiry_viewings(replaces_id) WHERE replaces_id IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER inquiry_viewing_insert BEFORE INSERT ON inquiry_viewings BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM inquiries i JOIN listings l ON l.id=i.listing_id
   WHERE i.id=NEW.inquiry_id AND i.is_demo=0 AND i.owner_id=NEW.owner_id AND i.renter_id=NEW.renter_id
   AND i.owner_id<>i.renter_id AND NEW.proposed_by IN(i.owner_id,i.renter_id) AND l.owner_id=i.owner_id AND l.status IN('published','paused'))
   THEN RAISE(ABORT,'VIEWING_PARTIES') END;
 SELECT CASE WHEN NEW.status<>'proposed' OR NEW.version<>1 OR NEW.updated_by<>NEW.proposed_by OR NEW.updated_at<>NEW.created_at OR NEW.decision_note<>''
   OR length(trim(NEW.note))>500 OR julianday(NEW.starts_at) IS NULL OR julianday(NEW.ends_at) IS NULL
   OR unixepoch(NEW.ends_at)-unixepoch(NEW.starts_at) NOT IN(1800,3600) OR julianday(NEW.starts_at)<=julianday('now')
   OR julianday(NEW.starts_at)>julianday('now','+90 days') OR NEW.created_day<>date(NEW.created_at,'+8 hours')
   THEN RAISE(ABORT,'VIEWING_DETAILS') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM inquiry_rental_offers o JOIN rental_connections c ON c.id=o.connection_id
   WHERE o.inquiry_id=NEW.inquiry_id AND (c.status IN('accepted','ended') OR (c.status='pending' AND c.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))))
   THEN RAISE(ABORT,'VIEWING_RENTAL_STARTED') END;
 SELECT CASE WHEN (SELECT count(*) FROM inquiry_viewings)>=5000 OR
   (SELECT count(*) FROM inquiry_viewings WHERE proposed_by=NEW.proposed_by AND created_day=NEW.created_day)>=20
   THEN RAISE(ABORT,'VIEWING_LIMIT') END;
 SELECT CASE WHEN NEW.replaces_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM inquiry_viewings v WHERE v.id=NEW.replaces_id
   AND v.inquiry_id=NEW.inquiry_id AND v.status='cancelled' AND v.updated_by=NEW.proposed_by AND v.decision_note='Rescheduled')
   THEN RAISE(ABORT,'VIEWING_REPLACE') END;
END;
--> statement-breakpoint
CREATE TRIGGER inquiry_viewing_update BEFORE UPDATE ON inquiry_viewings BEGIN
 SELECT CASE WHEN NEW.id<>OLD.id OR NEW.seq<>OLD.seq OR NEW.inquiry_id<>OLD.inquiry_id OR NEW.owner_id<>OLD.owner_id OR NEW.renter_id<>OLD.renter_id
   OR NEW.proposed_by<>OLD.proposed_by OR NEW.starts_at<>OLD.starts_at OR NEW.ends_at<>OLD.ends_at OR NEW.note<>OLD.note
   OR NEW.replaces_id IS NOT OLD.replaces_id OR NEW.created_at<>OLD.created_at OR NEW.created_day<>OLD.created_day
   THEN RAISE(ABORT,'VIEWING_IMMUTABLE') END;
 SELECT CASE WHEN NOT ((OLD.status='proposed' AND NEW.status IN('confirmed','declined','cancelled')) OR (OLD.status='confirmed' AND NEW.status IN('completed','cancelled')))
   OR NEW.version<>OLD.version+1 OR NEW.updated_by NOT IN(OLD.owner_id,OLD.renter_id) OR NEW.updated_at<OLD.updated_at OR length(NEW.decision_note)>300
   OR (NEW.status IN('confirmed','declined') AND NEW.updated_by=OLD.proposed_by)
   OR (NEW.status='completed' AND (NEW.updated_by<>OLD.owner_id OR julianday(NEW.starts_at)>julianday('now')))
   OR (NEW.status='confirmed' AND julianday(NEW.starts_at)<=julianday('now'))
   THEN RAISE(ABORT,'VIEWING_STATE') END;
 SELECT CASE WHEN NEW.status='confirmed' AND (NOT EXISTS(SELECT 1 FROM inquiries i JOIN listings l ON l.id=i.listing_id
   WHERE i.id=NEW.inquiry_id AND l.status IN('published','paused')) OR EXISTS(SELECT 1 FROM inquiry_rental_offers o JOIN rental_connections c ON c.id=o.connection_id
   WHERE o.inquiry_id=NEW.inquiry_id AND (c.status IN('accepted','ended') OR (c.status='pending' AND c.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')))))
   THEN RAISE(ABORT,'VIEWING_RENTAL_STARTED') END;
 SELECT CASE WHEN NEW.status='confirmed' AND EXISTS(SELECT 1 FROM inquiry_viewings v WHERE v.id<>NEW.id AND v.status='confirmed'
   AND (v.owner_id IN(NEW.owner_id,NEW.renter_id) OR v.renter_id IN(NEW.owner_id,NEW.renter_id))
   AND v.starts_at<NEW.ends_at AND v.ends_at>NEW.starts_at) THEN RAISE(ABORT,'VIEWING_OVERLAP') END;
END;
--> statement-breakpoint
CREATE TRIGGER inquiry_viewing_created AFTER INSERT ON inquiry_viewings BEGIN
 INSERT INTO inquiry_viewing_events(viewing_id,action,actor_id,note,created_at) VALUES(NEW.id,'proposed',NEW.proposed_by,NEW.note,NEW.created_at);
 INSERT OR IGNORE INTO app_notifications(id,user_id,kind,target_id,created_at)
   SELECT 'viewing:'||NEW.id||':proposed',CASE WHEN NEW.proposed_by=NEW.owner_id THEN NEW.renter_id ELSE NEW.owner_id END,'viewing',NEW.inquiry_id,NEW.created_at
   WHERE (SELECT count(*) FROM app_notifications)<10000;
END;
--> statement-breakpoint
CREATE TRIGGER inquiry_viewing_changed AFTER UPDATE OF status ON inquiry_viewings BEGIN
 INSERT INTO inquiry_viewing_events(viewing_id,action,actor_id,note,created_at) VALUES(NEW.id,NEW.status,NEW.updated_by,NEW.decision_note,NEW.updated_at);
 INSERT OR IGNORE INTO app_notifications(id,user_id,kind,target_id,created_at)
   SELECT 'viewing:'||NEW.id||':'||NEW.status,CASE WHEN NEW.updated_by=NEW.owner_id THEN NEW.renter_id ELSE NEW.owner_id END,'viewing',NEW.inquiry_id,NEW.updated_at
   WHERE (SELECT count(*) FROM app_notifications)<10000;
END;
--> statement-breakpoint
CREATE TRIGGER inquiry_viewing_event_immutable BEFORE UPDATE ON inquiry_viewing_events BEGIN SELECT RAISE(ABORT,'VIEWING_IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER inquiry_viewing_listing_unavailable AFTER UPDATE OF status ON listings
WHEN NEW.status IN('rented','withdrawn') AND NEW.status<>OLD.status
BEGIN
 UPDATE inquiry_viewings SET status='cancelled',version=version+1,updated_by=owner_id,
   updated_at=max(updated_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),decision_note='Listing marked '||NEW.status
 WHERE inquiry_id IN(SELECT id FROM inquiries WHERE listing_id=NEW.id) AND status IN('proposed','confirmed');
END;
