import { philippinesDay } from "./rentals.ts";
import type { NotificationKind } from "./notifications.ts";
import { sendWebPush, type VapidConfig } from "./web-push.ts";

// Resolve an email invitation only while it is still intended for that email.
// Inquiry offers are bound to their original account by the same SQL transaction.
export const pushRecipientSql = `(n.user_id=s.user_id OR (n.user_id IS NULL AND n.recipient_email=s.email
  AND EXISTS(SELECT 1 FROM rental_connections c WHERE c.id=n.target_id AND c.invite_email=s.email AND c.status='pending' AND c.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  AND NOT EXISTS(SELECT 1 FROM inquiry_rental_offers o WHERE o.connection_id=n.target_id AND o.target_renter_id<>s.user_id)))`;
export const actionableNotificationSql = `(n.kind NOT IN ('bill','due_soon','due','overdue','invitation','payment_reported') OR
  (n.kind IN ('bill','due_soon','due','overdue') AND EXISTS(SELECT 1 FROM rental_bills b JOIN rental_connections c ON c.id=b.connection_id
    WHERE b.id=n.target_id AND b.status='issued' AND c.status='accepted'
    AND b.amount_cents>coalesce((SELECT sum(p.amount_cents) FROM rental_payments p WHERE p.bill_id=b.id AND p.status='confirmed'),0)
    AND NOT EXISTS(SELECT 1 FROM rental_payments p WHERE p.bill_id=b.id AND p.status='pending'))) OR
  (n.kind='invitation' AND EXISTS(SELECT 1 FROM rental_connections c WHERE c.id=n.target_id AND c.status='pending' AND c.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))) OR
  (n.kind='payment_reported' AND EXISTS(SELECT 1 FROM rental_payments p WHERE 'payment-reported:'||p.id=n.id AND p.status='pending')))`;

export function pushConfiguration(env: { VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string; VAPID_SUBJECT?: string }): VapidConfig | null {
  return env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT ? { publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY,subject:env.VAPID_SUBJECT } : null;
}

export async function createRentReminders(db: D1Database, now = new Date()) {
  const day=philippinesDay(now),timestamp=now.toISOString();
  // One reminder 3 days before, on the due date, and 1 and 7 days late.
  // Pending reports suppress reminders, including partial payments being checked.
  const result=await db.prepare(`INSERT OR IGNORE INTO app_notifications(id,user_id,kind,target_id,created_at)
    SELECT 'reminder:'||b.id||':'||?,b.renter_id,
      CASE WHEN b.due_date> ? THEN 'due_soon' WHEN b.due_date= ? THEN 'due' ELSE 'overdue' END,b.id,?
    FROM rental_bills b JOIN rental_connections c ON c.id=b.connection_id
    WHERE b.status='issued' AND c.status='accepted' AND b.created_day< ?
    AND b.due_date IN(date(?,'+3 days'),?,date(?,'-1 day'),date(?,'-7 days'))
    AND b.amount_cents>coalesce((SELECT sum(p.amount_cents) FROM rental_payments p WHERE p.bill_id=b.id AND p.status='confirmed'),0)
    AND NOT EXISTS(SELECT 1 FROM rental_payments p WHERE p.bill_id=b.id AND p.status='pending')
    AND NOT EXISTS(SELECT 1 FROM app_notifications n WHERE n.id='reminder:'||b.id||':'||?)
    ORDER BY b.due_date,b.id LIMIT max(0,min(30,10000-(SELECT count(*) FROM app_notifications)))`)
    .bind(day,day,day,timestamp,day,day,day,day,day,day).run();
  return result.meta.changes;
}

type Delivery = { notificationId: string; subscriptionId: string; kind: NotificationKind; targetId: string; endpoint: string; p256dh: string; auth: string; attempts: number };
export async function dispatchNotifications(db: D1Database, config: VapidConfig | null, now=new Date(), sender=sendWebPush) {
  if(!config) return {sent:0,failed:0};
  const timestamp=now.toISOString(),recent=new Date(now.getTime()-86400000).toISOString();
  await db.prepare(`INSERT OR IGNORE INTO push_deliveries(notification_id,subscription_id,next_attempt_at)
    SELECT n.id,s.id,? FROM app_notifications n JOIN push_subscriptions s ON ${pushRecipientSql}
    WHERE n.read_at IS NULL AND n.created_at>=s.created_at AND n.created_at>=? AND (n.kind<>'device_test' OR n.target_id=s.id) AND ${actionableNotificationSql}
    AND NOT EXISTS(SELECT 1 FROM push_deliveries d WHERE d.notification_id=n.id AND d.subscription_id=s.id)
    ORDER BY n.created_at,n.id LIMIT max(0,min(24,20000-(SELECT count(*) FROM push_deliveries)))`).bind(timestamp,recent).run();
  const rows=await db.prepare(`SELECT d.notification_id AS notificationId,d.subscription_id AS subscriptionId,d.attempts,
    n.kind,n.target_id AS targetId,s.endpoint,s.p256dh,s.auth FROM push_deliveries d
    JOIN app_notifications n ON n.id=d.notification_id JOIN push_subscriptions s ON s.id=d.subscription_id
    WHERE d.sent_at IS NULL AND d.failed_at IS NULL AND d.attempts<3 AND d.next_attempt_at<=?
    AND (d.lease_until IS NULL OR d.lease_until<=?) AND n.read_at IS NULL AND n.created_at>=?
    AND (n.kind<>'device_test' OR n.target_id=s.id) AND ${pushRecipientSql} AND ${actionableNotificationSql} ORDER BY n.created_at,n.id LIMIT 6`).bind(timestamp,timestamp,recent).all<Delivery>();
  const summary={sent:0,failed:0};
  for(const row of rows.results){
    const lease=new Date(now.getTime()+60000).toISOString();
    const claim=await db.prepare(`UPDATE push_deliveries SET attempts=attempts+1,lease_until=? WHERE notification_id=? AND subscription_id=?
      AND sent_at IS NULL AND failed_at IS NULL AND attempts=? AND (lease_until IS NULL OR lease_until<=?) RETURNING notification_id`)
      .bind(lease,row.notificationId,row.subscriptionId,row.attempts,timestamp).first();
    if(!claim)continue;
    let status=0;
    try {
      status=await sender(row,JSON.stringify({id:row.notificationId}),config);
    } catch { /* Transport failures retry; never log browser endpoints or keys. */ }
    if(status>=200&&status<300){
      await db.prepare("UPDATE push_deliveries SET sent_at=?,lease_until=NULL WHERE notification_id=? AND subscription_id=?").bind(timestamp,row.notificationId,row.subscriptionId).run();summary.sent++;
    }else if(status===404||status===410){
      await db.prepare("DELETE FROM push_subscriptions WHERE id=?").bind(row.subscriptionId).run();summary.failed++;
    }else{
      const final=row.attempts>=2||status>=300&&status<400;
      const retry=new Date(now.getTime()+(row.attempts+1)*5*60000).toISOString();
      await db.prepare("UPDATE push_deliveries SET lease_until=NULL,next_attempt_at=?,failed_at=? WHERE notification_id=? AND subscription_id=?").bind(retry,final?timestamp:null,row.notificationId,row.subscriptionId).run();summary.failed++;
    }
  }
  return summary;
}

export async function notificationMaintenance(db: D1Database, now=new Date()) {
  // Notifications are temporary prompts. Original rental/payment records remain.
  await db.batch([
    db.prepare("DELETE FROM app_notifications WHERE created_at<?").bind(new Date(now.getTime()-60*86400000).toISOString()),
    db.prepare("DELETE FROM push_subscriptions WHERE updated_at<?").bind(new Date(now.getTime()-90*86400000).toISOString()),
    db.prepare("DELETE FROM push_deliveries WHERE notification_id IN(SELECT id FROM app_notifications WHERE created_at<?)").bind(new Date(now.getTime()-7*86400000).toISOString()),
  ]);
}
