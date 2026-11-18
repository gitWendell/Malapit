import { REPORT_EXPORT_LIMITS, REPORT_UNIT_LIMIT } from "./rental-reports.ts";

// These prepared queries are also executed against the real migrated schema in
// tests. Identity always comes from the server, never a URL owner parameter.
const bills = `WITH scoped_bills AS (
  SELECT b.*, c.unit_id, c.property_name, c.unit_name, c.renter_name
  FROM rental_bills b JOIN rental_connections c ON c.id=b.connection_id AND c.owner_id=b.owner_id
  JOIN rental_units u ON u.id=c.unit_id AND u.owner_id=b.owner_id
  WHERE b.owner_id=? AND b.month=? AND (? IS NULL OR c.unit_id=?)
), balances AS (
  SELECT b.*,
    coalesce((SELECT sum(p.amount_cents) FROM rental_payments p WHERE p.bill_id=b.id AND p.owner_id=b.owner_id AND p.status='confirmed'),0) AS confirmed,
    coalesce((SELECT sum(p.amount_cents) FROM rental_payments p WHERE p.bill_id=b.id AND p.owner_id=b.owner_id AND p.status='pending'),0) AS pending,
    (SELECT count(*) FROM rental_payments p WHERE p.bill_id=b.id AND p.owner_id=b.owner_id AND p.status='pending') AS pending_count
  FROM scoped_bills b
)`;
export function ownerUnitsReportQuery(ownerId: string, month: string, unitId: string | null = null) {
  return { sql: `${bills}, unit_bills AS (
    SELECT unit_id, count(*) AS history_count,
      sum(CASE WHEN status='issued' THEN 1 ELSE 0 END) AS bill_count,
      sum(CASE WHEN status='voided' THEN 1 ELSE 0 END) AS cancelled_count,
      sum(CASE WHEN status='issued' THEN amount_cents ELSE 0 END) AS billed,
      sum(CASE WHEN status='issued' THEN confirmed ELSE 0 END) AS confirmed,
      sum(CASE WHEN status='issued' THEN amount_cents-confirmed ELSE 0 END) AS remaining,
      sum(CASE WHEN status='issued' THEN pending ELSE 0 END) AS pending,
      sum(CASE WHEN status='issued' THEN pending_count ELSE 0 END) AS pending_count
    FROM balances GROUP BY unit_id
  ) SELECT u.id AS unitId,u.property_name AS propertyName,u.unit_name AS unitName,u.archived_at AS archivedAt,
    coalesce(b.bill_count,0) AS billCount,coalesce(b.cancelled_count,0) AS cancelledBillCount,
    coalesce(b.billed,0) AS billedCents,coalesce(b.confirmed,0) AS confirmedCents,coalesce(b.remaining,0) AS remainingCents,
    coalesce(b.pending,0) AS pendingCents,coalesce(b.pending_count,0) AS pendingCount
  FROM rental_units u LEFT JOIN unit_bills b ON b.unit_id=u.id
  WHERE u.owner_id=? AND (? IS NULL OR u.id=?) AND (u.archived_at IS NULL OR b.history_count>0 OR ? IS NOT NULL)
  ORDER BY u.property_name COLLATE NOCASE,u.unit_name COLLATE NOCASE,u.id LIMIT ${REPORT_UNIT_LIMIT + 1}`,
  params: [ownerId, month, unitId, unitId, ownerId, unitId, unitId, unitId] };
}
export function ownerBillsReportQuery(ownerId: string, month: string, unitId: string | null = null) {
  return { sql: `${bills} SELECT id AS billId,connection_id AS connectionId,unit_id AS unitId,
    property_name AS propertyName,unit_name AS unitName,renter_name AS renterName,month,period_start AS periodStart,period_end AS periodEnd,
    due_date AS dueDate,status,source,amount_cents AS amountCents,
    CASE WHEN status='issued' THEN amount_cents ELSE 0 END AS billedCents,
    CASE WHEN status='issued' THEN confirmed ELSE 0 END AS confirmedCents,
    CASE WHEN status='issued' THEN amount_cents-confirmed ELSE 0 END AS remainingCents,
    CASE WHEN status='issued' THEN pending ELSE 0 END AS pendingCents,
    CASE WHEN status='issued' THEN pending_count ELSE 0 END AS pendingCount,
    created_at AS createdAt,voided_at AS voidedAt,void_reason AS voidReason
    FROM balances ORDER BY property_name COLLATE NOCASE,unit_name COLLATE NOCASE,due_date,created_at,id LIMIT ${REPORT_EXPORT_LIMITS.bills + 1}`,
  params: [ownerId, month, unitId, unitId] };
}
export function ownerPaymentsReportQuery(ownerId: string, month: string, unitId: string | null = null) {
  return { sql: `SELECT p.id AS paymentId,b.id AS billId,c.unit_id AS unitId,c.property_name AS propertyName,c.unit_name AS unitName,
    c.renter_name AS renterName,b.month,b.status AS billStatus,p.paid_at AS paidAt,p.method,p.reference,p.amount_cents AS amountCents,
    CASE WHEN p.status='confirmed' AND b.status='issued' THEN p.amount_cents ELSE 0 END AS confirmedCents,
    p.status,p.note,p.created_at AS createdAt,p.reviewed_at AS reviewedAt,p.decision_reason AS decisionReason,
    p.duplicate_reason AS duplicateReason,p.reversed_at AS reversedAt,p.reversal_reason AS reversalReason
    FROM rental_payments p JOIN rental_bills b ON b.id=p.bill_id AND b.owner_id=p.owner_id
    JOIN rental_connections c ON c.id=b.connection_id AND c.owner_id=b.owner_id
    JOIN rental_units u ON u.id=c.unit_id AND u.owner_id=b.owner_id
    WHERE b.owner_id=? AND b.month=? AND (? IS NULL OR c.unit_id=?)
    ORDER BY p.created_at,p.id LIMIT ${REPORT_EXPORT_LIMITS.payments + 1}`,
  params: [ownerId, month, unitId, unitId] };
}
