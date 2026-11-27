import { z } from "zod";

export const NOTIFICATION_LIMITS = { page: 20, stored: 10000, subscriptions: 500, devicesPerUser: 3, retentionDays: 60 };
export const notificationCopy = {
  device_test: ["Malapit notifications are on", "This is your test alert. Open Malapit to see your rental updates."],
  viewing: ["Viewing update", "A viewing request changed. Open the conversation to check the time and next steps."],
  inquiry: ["New rental inquiry", "A renter is interested in your place. Open the conversation to reply."],
  message: ["New rental message", "You have a new message in a rental conversation."],
  invitation: ["Rental details to review", "An owner has shared rental details with you. Review them before accepting."],
  accepted: ["Rental accepted", "Your renter accepted the rental details. Open the rental to see the next steps."],
  declined: ["Rental invitation declined", "Your renter declined this invitation. Open the rental for its current status."],
  revoked: ["Rental invitation withdrawn", "The owner withdrew this invitation. Open the rental for its current status."],
  ended: ["Rental connection closed", "This rental connection has closed. Your original records remain available."],
  bill: ["Rent bill ready", "Your rent bill is ready. Open it to check the amount and the owner's payment options."],
  due_soon: ["Rent is due in 3 days", "Open your bill to check its balance and payment options."],
  due: ["Rent payment reminder", "Open your bill to check its balance, due date and payment options."],
  overdue: ["Rent bill needs attention", "A rent bill has a balance past its due date. Open it to check the current records."],
  payment_reported: ["Payment report to check", "A renter reported a payment. Check your own bank or wallet records before confirming."],
  payment_confirmed: ["Owner confirmed payment", "The owner recorded receipt of a payment. Open your bill to see the updated balance."],
  payment_rejected: ["Payment report needs correction", "The owner asked for a correction. Open your bill to read the reason."],
  payment_reversed: ["Payment record corrected", "The owner reversed a payment record. Open your bill to check the reason and balance."],
  bill_voided: ["Rent bill cancelled", "The owner cancelled a rent bill. Open it to check the reason."],
} as const;
export type NotificationKind = keyof typeof notificationCopy;
export type NotificationItem = { id: string; kind: NotificationKind; title: string; body: string; href: string; createdAt: string; readAt: string | null };
export type NotificationPage = { items: NotificationItem[]; unread: number; hasMore: boolean; page: number; through: string };
export type PushSettings = { publicKey: string | null; enabled: boolean };
export const notificationId = z.string().min(1).max(200).regex(/^[a-zA-Z0-9:_-]+$/);
export const readNotificationsInput = z.union([
  z.object({ id: notificationId }),
  z.object({ through: z.string().datetime() }),
]);

export function notificationHref(kind: NotificationKind, target: string) {
  if(kind === "device_test") return "/?view=notifications";
  if (kind === "inquiry" || kind === "message" || kind === "viewing") return "/?view=inbox&inquiry=" + encodeURIComponent(target);
  if (["invitation", "accepted", "declined", "revoked", "ended"].includes(kind)) return "/?view=rentals&invite=" + encodeURIComponent(target);
  return "/?view=rentals&bill=" + encodeURIComponent(target);
}

export function allowedPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash && !url.port &&
      ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"].includes(url.hostname) && url.pathname.length > 1;
  } catch { return false; }
}
export const pushSubscriptionInput = z.object({
  endpoint: z.string().max(2048).refine(allowedPushEndpoint, "Use a supported browser push subscription."),
  keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/), auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/) }),
});
export function base64UrlBytes(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), char => char.charCodeAt(0));
}
export function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
