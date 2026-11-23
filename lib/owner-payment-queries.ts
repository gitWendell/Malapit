import { sql } from "drizzle-orm";
import { ownerPaymentQrs } from "../db/schema.ts";
export function qrAccessScope(userId:string){
  return sql`(${ownerPaymentQrs.ownerId}=${userId} OR EXISTS(
    SELECT 1 FROM owner_payment_methods m JOIN rental_bills b ON b.owner_id=m.owner_id
    WHERE m.qr_image_id="owner_payment_qrs"."id" AND m.archived_at IS NULL
    AND b.renter_id=${userId} AND b.status='issued'
    AND b.amount_cents>coalesce((SELECT sum(p.amount_cents) FROM rental_payments p WHERE p.bill_id=b.id AND p.status='confirmed'),0)
  ) OR EXISTS(
    SELECT 1 FROM rental_payments p WHERE json_extract(p.destination_snapshot,'$.qrImageId')="owner_payment_qrs"."id"
    AND (p.owner_id=${userId} OR p.renter_id=${userId})
  ))`;
}
