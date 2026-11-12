CREATE TABLE `upload_usage` (
	`owner_id` text NOT NULL,
	`day` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`owner_id`, `day`)
);
--> statement-breakpoint
ALTER TABLE `media` ADD `byte_size` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `media` ADD `state` text DEFAULT 'ready' NOT NULL;
--> statement-breakpoint
-- Existing photos have unknown sizes. Reserve the old maximum conservatively.
UPDATE media SET byte_size = 5242880 WHERE byte_size = 0;
--> statement-breakpoint
CREATE INDEX media_owner_created_idx ON media(owner_id, created_at);
--> statement-breakpoint
CREATE INDEX listings_status_idx ON listings(status);
--> statement-breakpoint
CREATE TRIGGER pilot_property_insert BEFORE INSERT ON listings
WHEN NEW.status NOT IN ('rented', 'withdrawn') AND (SELECT COUNT(*) FROM listings WHERE status NOT IN ('rented', 'withdrawn')) >= 30
BEGIN SELECT RAISE(ABORT, 'PILOT_PROPERTIES_FULL'); END;
--> statement-breakpoint
CREATE TRIGGER pilot_property_reopen BEFORE UPDATE OF status ON listings
WHEN OLD.status IN ('rented', 'withdrawn') AND NEW.status NOT IN ('rented', 'withdrawn') AND (SELECT COUNT(*) FROM listings WHERE status NOT IN ('rented', 'withdrawn')) >= 30
BEGIN SELECT RAISE(ABORT, 'PILOT_PROPERTIES_FULL'); END;
--> statement-breakpoint
CREATE TRIGGER pilot_photo_reserve BEFORE INSERT ON media
BEGIN
  SELECT CASE WHEN NEW.byte_size <= 0 OR NEW.byte_size > 409600
    OR (SELECT COALESCE(SUM(byte_size), 0) FROM media) + NEW.byte_size > 104857600
    OR (SELECT COUNT(*) FROM media) >= 250
    THEN RAISE(ABORT, 'PILOT_STORAGE_FULL') END;
  SELECT CASE WHEN (SELECT COALESCE(MAX(attempts), 0) FROM upload_usage
    WHERE owner_id = NEW.owner_id AND day = date('now', '+8 hours')) >= 10
    THEN RAISE(ABORT, 'PILOT_UPLOAD_LIMIT') END;
END;
--> statement-breakpoint
CREATE TRIGGER pilot_photo_daily_usage AFTER INSERT ON media
BEGIN
  INSERT INTO upload_usage(owner_id, day, attempts) VALUES (NEW.owner_id, date('now', '+8 hours'), 1)
    ON CONFLICT(owner_id, day) DO UPDATE SET attempts = attempts + 1;
END;
--> statement-breakpoint
CREATE TRIGGER pilot_listing_photos_insert BEFORE INSERT ON listings
BEGIN
  SELECT CASE WHEN COALESCE(json_array_length(NEW.data, '$.photos'), 0) < 1 OR json_array_length(NEW.data, '$.photos') > 5
    OR EXISTS (SELECT 1 FROM json_each(NEW.data, '$.photos') AS image
      LEFT JOIN media AS photo ON '/api/media/' || photo.id = image.value
      WHERE photo.id IS NULL OR photo.owner_id <> NEW.owner_id OR photo.state <> 'ready')
    THEN RAISE(ABORT, 'PILOT_PHOTO_REFERENCE') END;
END;
--> statement-breakpoint
CREATE TRIGGER pilot_listing_photos_update BEFORE UPDATE OF data ON listings
BEGIN
  SELECT CASE WHEN COALESCE(json_array_length(NEW.data, '$.photos'), 0) < 1 OR json_array_length(NEW.data, '$.photos') > 5
    OR EXISTS (SELECT 1 FROM json_each(NEW.data, '$.photos') AS image
      LEFT JOIN media AS photo ON '/api/media/' || photo.id = image.value
      WHERE photo.id IS NULL OR photo.owner_id <> NEW.owner_id OR photo.state <> 'ready')
    THEN RAISE(ABORT, 'PILOT_PHOTO_REFERENCE') END;
END;
