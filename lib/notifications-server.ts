import { env } from "cloudflare:workers";
import type { AuthIdentity } from "./auth";
import { HttpError } from "./server";
import { base64UrlBytes, notificationCopy, notificationHref, notificationId, pushSubscriptionInput, readNotificationsInput, type NotificationItem, type NotificationKind, type NotificationPage } from "./notifications";
import { actionableNotificationSql, pushConfiguration } from "./notification-jobs";

function database(){if(!env.DB)throw new HttpError(503,"Notifications are temporarily unavailable.");return env.DB;}
const scope=`(user_id=? OR (user_id IS NULL AND recipient_email=? AND NOT EXISTS(SELECT 1 FROM inquiry_rental_offers o WHERE o.connection_id=app_notifications.target_id AND o.target_renter_id<>?)))`;
const userArgs=(user:AuthIdentity)=>[user.userId,user.email.trim().toLowerCase(),user.userId];
type Row={id:string;kind:NotificationKind;target_id:string;created_at:string;read_at:string|null;actionable:number};
function item(row:Row):NotificationItem {
  let title:string=notificationCopy[row.kind][0],body:string=notificationCopy[row.kind][1],href=row.kind==="revoked"?"/?view=rentals":notificationHref(row.kind,row.target_id);
  if(!row.actionable){
    title=row.kind==="invitation"?"Rental invitation updated":row.kind==="payment_reported"?"Payment report updated":"Rent bill updated";
    body="Open the record to check its current status and next steps.";
    if(row.kind==="invitation")href="/?view=rentals";
  }
  return {id:row.id,kind:row.kind,title,body,href,createdAt:row.created_at,readAt:row.read_at};
}
async function claimInvitations(user:AuthIdentity){
  // Once an email invitation is read by its verified account, keep its history
  // attached to that account rather than making it follow a later email change.
  await database().prepare(`UPDATE app_notifications SET user_id=?,recipient_email=NULL WHERE user_id IS NULL AND recipient_email=?
    AND NOT EXISTS(SELECT 1 FROM inquiry_rental_offers o WHERE o.connection_id=app_notifications.target_id AND o.target_renter_id<>?)`).bind(...userArgs(user)).run();
}
export async function notificationsFor(url:URL,user:AuthIdentity):Promise<NotificationPage>{
  await claimInvitations(user);
  const raw=url.searchParams.get("page")||"0";if(!/^\d{1,3}$/.test(raw))throw new HttpError(400,"Choose a valid notification page.");
  const page=Number(raw),through=new Date().toISOString(),db=database();
  const [rows,count]=await Promise.all([
    db.prepare(`SELECT n.*,${actionableNotificationSql} AS actionable FROM app_notifications n WHERE ${scope.replaceAll("app_notifications.","n.")} ORDER BY n.created_at DESC,n.id DESC LIMIT 21 OFFSET ?`).bind(...userArgs(user),page*20).all<Row>(),
    db.prepare(`SELECT count(*) AS count FROM app_notifications WHERE ${scope} AND read_at IS NULL`).bind(...userArgs(user)).first<{count:number}>(),
  ]);
  return {items:rows.results.slice(0,20).filter(row=>row.kind in notificationCopy).map(item),unread:count?.count||0,hasMore:rows.results.length>20,page,through};
}
export async function notificationFor(id:string,user:AuthIdentity){
  if(!notificationId.safeParse(id).success)throw new HttpError(404,"This notification is not available to this account.");
  const row=await database().prepare(`SELECT n.*,${actionableNotificationSql} AS actionable FROM app_notifications n WHERE n.id=? AND ${scope.replaceAll("app_notifications.","n.")}`).bind(id,...userArgs(user)).first<Row>();
  if(!row||!(row.kind in notificationCopy))throw new HttpError(404,"This notification is not available to this account.");
  return item(row);
}
export async function readNotifications(input:unknown,user:AuthIdentity){
  const data=readNotificationsInput.parse(input),db=database(),now=new Date().toISOString();
  if("id" in data){await notificationFor(data.id,user);await db.prepare(`UPDATE app_notifications SET read_at=coalesce(read_at,?) WHERE id=? AND ${scope}`).bind(now,data.id,...userArgs(user)).run();}
  else{
    if(data.through>now)throw new HttpError(400,"Refresh notifications before marking them as read.");
    await db.prepare(`UPDATE app_notifications SET read_at=? WHERE ${scope} AND read_at IS NULL AND created_at<=?`).bind(now,...userArgs(user),data.through).run();
  }
  return {ok:true};
}
export function pushDeviceId(request:Request){const value=request.headers.get("cookie")?.match(/(?:^|;\s*)__malapit_push_device=([a-f0-9-]{36})(?:;|$)/)?.[1];return value||null;}
export function pushDeviceCookie(id:string|null,request:Request){return `__malapit_push_device=${id||""}; Path=/; HttpOnly; SameSite=Lax${new URL(request.url).protocol==="https:"?"; Secure":""}; Max-Age=${id?90*86400:0}`;}
export async function pushSettings(request:Request,user:AuthIdentity){
  const config=pushConfiguration(env),id=pushDeviceId(request);
  const device=id?await database().prepare("SELECT id FROM push_subscriptions WHERE id=? AND user_id=?").bind(id,user.userId).first():null;
  if(device)await database().prepare("UPDATE push_subscriptions SET updated_at=? WHERE id=? AND user_id=?").bind(new Date().toISOString(),id,user.userId).run();
  return {publicKey:config?.publicKey||null,enabled:!!device};
}
export async function savePushSubscription(request:Request,input:unknown,user:AuthIdentity){
  if(!pushConfiguration(env))throw new HttpError(503,"Phone notifications are being prepared. Updates are still available here.");
  const data=pushSubscriptionInput.parse(input),key=base64UrlBytes(data.keys.p256dh),db=database();
  if(key.length!==65||key[0]!==4)throw new HttpError(400,"This browser returned invalid notification keys.");
  try{await crypto.subtle.importKey("raw",key,{name:"ECDH",namedCurve:"P-256"},false,[]);}catch{throw new HttpError(400,"This browser returned invalid notification keys.");}
  const now=new Date().toISOString(),device=pushDeviceId(request);
  const existing=await db.prepare("SELECT id,user_id,p256dh,auth FROM push_subscriptions WHERE endpoint=?").bind(data.endpoint).first<{id:string;user_id:string;p256dh:string;auth:string}>();
  if(existing){
    if(existing.user_id!==user.userId||existing.p256dh!==data.keys.p256dh||existing.auth!==data.keys.auth)throw new HttpError(409,"Turn notifications off on this browser before connecting another account.");
    await db.prepare("UPDATE push_subscriptions SET email=?,updated_at=? WHERE id=? AND user_id=?").bind(user.email.trim().toLowerCase(),now,existing.id,user.userId).run();
    return existing.id;
  }
  const id=crypto.randomUUID();
  try{
    await db.batch([
      ...(device?[db.prepare("DELETE FROM push_subscriptions WHERE id=? AND user_id=?").bind(device,user.userId)]:[]),
      db.prepare(`INSERT INTO push_subscriptions(id,user_id,email,endpoint,p256dh,auth,created_at,updated_at)
        SELECT ?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM push_subscriptions WHERE user_id=?)<3 AND (SELECT count(*) FROM push_subscriptions)<500`)
        .bind(id,user.userId,user.email.trim().toLowerCase(),data.endpoint,data.keys.p256dh,data.keys.auth,now,now,user.userId),
    ]);
  }catch{
    const raced=await db.prepare("SELECT id FROM push_subscriptions WHERE endpoint=? AND user_id=? AND p256dh=? AND auth=?").bind(data.endpoint,user.userId,data.keys.p256dh,data.keys.auth).first<{id:string}>();
    if(raced)return raced.id;
    throw new HttpError(409,"This browser's notification setup changed. Turn notifications off and try again.");
  }
  if(!await db.prepare("SELECT id FROM push_subscriptions WHERE id=?").bind(id).first())throw new HttpError(409,"Notification devices reached the free test limit. Turn off another device or contact Malapit.");
  return id;
}
export async function removePushDevice(request:Request,user?:AuthIdentity){
  const id=pushDeviceId(request);if(!id)return;
  await database().prepare("DELETE FROM push_subscriptions WHERE id=?"+(user?" AND user_id=?":"")).bind(...(user?[id,user.userId]:[id])).run();
}
export async function createDeviceTest(request:Request,user:AuthIdentity){
  const device=pushDeviceId(request),db=database(),now=new Date(),timestamp=now.toISOString();
  if(!pushConfiguration(env)||!device)throw new HttpError(409,"Turn on notifications for this device first.");
  const found=await db.prepare("SELECT id FROM push_subscriptions WHERE id=? AND user_id=?").bind(device,user.userId).first();
  if(!found)throw new HttpError(409,"Turn on notifications for this device first.");
  const id="device-test:"+crypto.randomUUID();
  const created=await db.prepare(`INSERT INTO app_notifications(id,user_id,kind,target_id,created_at)
    SELECT ?,?,'device_test',?,? WHERE (SELECT count(*) FROM app_notifications)<10000
    AND (SELECT count(*) FROM app_notifications WHERE user_id=? AND kind='device_test' AND created_at>=?)<5
    AND NOT EXISTS(SELECT 1 FROM app_notifications WHERE user_id=? AND kind='device_test' AND created_at>?) RETURNING id`)
    .bind(id,user.userId,device,timestamp,user.userId,new Date(now.getTime()-86400000).toISOString(),user.userId,new Date(now.getTime()-60000).toISOString()).first();
  if(!created)throw new HttpError(429,"Wait a minute before another test. You can send five test alerts per day.");
  await db.prepare("INSERT INTO push_deliveries(notification_id,subscription_id,next_attempt_at) VALUES(?,?,?)").bind(id,device,timestamp).run();
  return {ok:true};
}
