CREATE INDEX `rental_payments_owner_status` ON `rental_payments` (`owner_id`,`status`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER rental_schedule_insert BEFORE INSERT ON rental_bill_schedules
BEGIN
  SELECT CASE WHEN NEW.status <> 'enabled' OR NEW.updated_by <> NEW.owner_id OR NEW.version <> 1 OR NEW.issue <> '' OR NEW.first_month <> NEW.next_month
    OR length(NEW.next_month) <> 7 OR date(NEW.next_month || '-01','+0 days') IS NOT (NEW.next_month || '-01')
    OR NEW.next_month <= strftime('%Y-%m','now','+8 hours')
    THEN RAISE(ABORT,'RENTAL_SCHEDULE_STATE') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM rental_connections c WHERE c.id=NEW.connection_id AND c.owner_id=NEW.owner_id AND c.status='accepted'
    AND c.lease_start <= NEW.next_month || '-01' AND (c.lease_end IS NULL OR c.lease_end >= date(NEW.next_month || '-01','+1 month','-1 day')))
    THEN RAISE(ABORT,'RENTAL_SCHEDULE_CONNECTION') END;
  SELECT CASE WHEN (SELECT count(*) FROM rental_bill_schedules)>=10000 THEN RAISE(ABORT,'RENTAL_SCHEDULE_FULL') END;
END;
--> statement-breakpoint
CREATE TRIGGER rental_schedule_update BEFORE UPDATE ON rental_bill_schedules
BEGIN
  SELECT CASE WHEN NEW.connection_id IS NOT OLD.connection_id OR NEW.owner_id IS NOT OLD.owner_id OR NEW.created_at IS NOT OLD.created_at
    OR NEW.version <> OLD.version+1 OR NEW.updated_at IS NULL OR NEW.updated_by NOT IN (OLD.owner_id,'system')
    OR length(NEW.next_month) <> 7 OR date(NEW.next_month || '-01','+0 days') IS NOT (NEW.next_month || '-01')
    THEN RAISE(ABORT,'RENTAL_SCHEDULE_STATE') END;
  SELECT CASE WHEN NOT coalesce((
    (NEW.updated_by=OLD.owner_id AND NEW.status='paused' AND NEW.first_month=OLD.first_month AND NEW.next_month=OLD.next_month AND NEW.issue='')
    OR (NEW.updated_by=OLD.owner_id AND NEW.status='enabled' AND NEW.first_month=NEW.next_month AND NEW.issue='' AND NEW.next_month>strftime('%Y-%m','now','+8 hours')
      AND EXISTS (SELECT 1 FROM rental_connections c WHERE c.id=OLD.connection_id AND c.status='accepted' AND c.lease_start<=NEW.next_month || '-01'
        AND (c.lease_end IS NULL OR c.lease_end>=date(NEW.next_month || '-01','+1 month','-1 day'))))
    OR (NEW.updated_by='system' AND OLD.status='enabled' AND NEW.status='enabled' AND NEW.first_month=OLD.first_month AND NEW.issue=''
      AND NEW.next_month=strftime('%Y-%m',OLD.next_month || '-01','+1 month')
      AND EXISTS (SELECT 1 FROM rental_bills b WHERE b.id=NEW.last_bill_id AND b.connection_id=OLD.connection_id AND b.month=OLD.next_month AND b.status='issued'))
    OR (NEW.updated_by='system' AND NEW.status IN ('attention','finished') AND NEW.first_month=OLD.first_month AND NEW.next_month=OLD.next_month
      AND NEW.issue IN ('partial','missed','corrected','overlap','limit','unavailable','closed','ended'))
  ),0) THEN RAISE(ABORT,'RENTAL_SCHEDULE_STATE') END;
END;
--> statement-breakpoint
CREATE TRIGGER rental_schedule_created AFTER INSERT ON rental_bill_schedules
BEGIN
  INSERT INTO rental_events (id,connection_id,actor_id,actor_name,action,created_at)
  VALUES (lower(hex(randomblob(16))),NEW.connection_id,NEW.owner_id,(SELECT owner_name FROM rental_connections WHERE id=NEW.connection_id),'billing_enabled',NEW.updated_at);
END;
--> statement-breakpoint
CREATE TRIGGER rental_schedule_changed AFTER UPDATE ON rental_bill_schedules
WHEN NEW.status<>OLD.status OR NEW.first_month<>OLD.first_month
BEGIN
  INSERT INTO rental_events (id,connection_id,actor_id,actor_name,action,created_at)
  VALUES (lower(hex(randomblob(16))),NEW.connection_id,NEW.updated_by,
    CASE WHEN NEW.updated_by='system' THEN 'Malapit' ELSE (SELECT owner_name FROM rental_connections WHERE id=NEW.connection_id) END,
    CASE NEW.status WHEN 'enabled' THEN 'billing_enabled' WHEN 'paused' THEN 'billing_paused' WHEN 'attention' THEN 'billing_attention' ELSE 'billing_finished' END,NEW.updated_at);
END;
--> statement-breakpoint
CREATE TRIGGER rental_schedule_connection_closed AFTER UPDATE OF status ON rental_connections
WHEN NEW.status='ended'
BEGIN
  UPDATE rental_bill_schedules SET status='finished',issue='closed',updated_at=NEW.ended_at,updated_by='system',version=version+1
  WHERE connection_id=NEW.id AND status<>'finished';
END;
--> statement-breakpoint
CREATE TRIGGER rental_bill_source_insert BEFORE INSERT ON rental_bills
BEGIN
  SELECT CASE WHEN NEW.source NOT IN ('manual','scheduled') THEN RAISE(ABORT,'RENTAL_SCHEDULE_STATE') END;
  SELECT CASE WHEN NEW.source='scheduled' AND NOT EXISTS (
    SELECT 1 FROM rental_bill_schedules s JOIN rental_connections c ON c.id=s.connection_id
    WHERE s.connection_id=NEW.connection_id AND s.owner_id=NEW.owner_id AND s.status='enabled' AND s.next_month=NEW.month
      AND NEW.period_start=NEW.month || '-01' AND NEW.period_end=date(NEW.period_start,'+1 month','-1 day')
      AND NEW.amount_cents=c.monthly_rent_cents
      AND NEW.due_date=NEW.month || '-' || printf('%02d',min(c.due_day,CAST(strftime('%d',NEW.period_end) AS INTEGER)))
      AND NEW.created_day=strftime('%Y-%m-%d',NEW.created_at,'+8 hours') AND NEW.month=substr(NEW.created_day,1,7)
  ) THEN RAISE(ABORT,'RENTAL_SCHEDULE_STATE') END;
END;
--> statement-breakpoint
CREATE TRIGGER rental_bill_source_immutable BEFORE UPDATE ON rental_bills
WHEN NEW.source IS NOT OLD.source
BEGIN SELECT RAISE(ABORT,'RENTAL_BILL_IMMUTABLE'); END;
--> statement-breakpoint
DROP TRIGGER rental_bill_created;
--> statement-breakpoint
CREATE TRIGGER rental_bill_created AFTER INSERT ON rental_bills
BEGIN
  INSERT INTO rental_bill_events (id,bill_id,actor_id,actor_name,action,reason,created_at)
  VALUES (lower(hex(randomblob(16))),NEW.id,CASE WHEN NEW.source='scheduled' THEN 'system' ELSE NEW.owner_id END,
    CASE WHEN NEW.source='scheduled' THEN 'Malapit' ELSE (SELECT owner_name FROM rental_connections WHERE id=NEW.connection_id) END,
    CASE WHEN NEW.source='scheduled' THEN 'created_automatically' ELSE 'created' END,
    CASE WHEN NEW.source='scheduled' THEN 'Created from the automatic billing schedule enabled by the owner.' ELSE '' END,NEW.created_at);
END;
--> statement-breakpoint
CREATE TRIGGER rental_schedule_bill_corrected AFTER UPDATE OF status ON rental_bills
WHEN NEW.status='voided' AND NEW.source='scheduled'
BEGIN
  UPDATE rental_bill_schedules SET status='attention',issue='corrected',updated_at=NEW.voided_at,updated_by='system',version=version+1
  WHERE connection_id=NEW.connection_id AND status='enabled';
END;
