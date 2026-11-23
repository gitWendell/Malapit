import { followingMonth, scheduledPeriod } from "./rental-billing.ts";
import { philippinesDay, type RentalConnection } from "./rentals.ts";

type JobRow = Pick<RentalConnection, "status" | "leaseStart" | "leaseEnd" | "monthlyRentCents" | "dueDay"> & { connectionId: string; ownerId: string; renterId: string; nextMonth: string; version: number };
// Every mutation rechecks the enabled schedule/version in the same D1 transaction.
// A pause or a concurrent job therefore cannot silently issue a duplicate bill.
export async function runScheduledRentBills(db: D1Database, now = new Date()) {
  const timestamp = now.toISOString(), day = philippinesDay(now), month = day.slice(0, 7);
  const rows = await db.prepare(`SELECT s.connection_id AS connectionId,s.owner_id AS ownerId,s.next_month AS nextMonth,s.version,
    c.status,c.renter_id AS renterId,c.lease_start AS leaseStart,c.lease_end AS leaseEnd,c.monthly_rent_cents AS monthlyRentCents,c.due_day AS dueDay
    FROM rental_bill_schedules s JOIN rental_connections c ON c.id=s.connection_id
    WHERE s.status='enabled' AND s.next_month<=? ORDER BY s.next_month,s.connection_id LIMIT 8`).bind(month).all<JobRow>();
  const summary = { checked: rows.results.length, created: 0, skipped: 0, attention: 0, finished: 0 };
  async function stop(row: JobRow, issue: string, finished = false) {
    const result = await db.prepare(`UPDATE rental_bill_schedules SET status=?,issue=?,last_checked_at=?,updated_at=?,updated_by='system',version=version+1
      WHERE connection_id=? AND status='enabled' AND version=?`).bind(finished ? "finished" : "attention", issue, timestamp, timestamp, row.connectionId, row.version).run();
    if (result.meta.changes) summary[finished ? "finished" : "attention"]++;
  }
  for (const row of rows.results) {
    try {
      const period = scheduledPeriod(row.nextMonth, row, day);
      if ("issue" in period) { await stop(row, period.issue, period.finished); continue; }
      const existing = await db.prepare("SELECT id,status FROM rental_bills WHERE connection_id=? AND month=? ORDER BY status='issued' DESC LIMIT 1").bind(row.connectionId, row.nextMonth).first<{ id: string; status: string }>();
      if (existing?.status === "voided") { await stop(row, "corrected"); continue; }
      const next = followingMonth(row.nextMonth), id = crypto.randomUUID();
      const results = await db.batch([
        db.prepare(`INSERT INTO rental_bills (id,connection_id,owner_id,renter_id,month,period_start,period_end,due_date,amount_cents,note,status,created_at,created_day,source)
          SELECT ?,c.id,c.owner_id,c.renter_id,?,?,?,?,?,'','issued',?,?,'scheduled'
          FROM rental_connections c JOIN rental_bill_schedules s ON s.connection_id=c.id
          WHERE c.id=? AND c.status='accepted' AND s.status='enabled' AND s.version=? AND s.next_month=?
          AND NOT EXISTS (SELECT 1 FROM rental_bills b WHERE b.connection_id=c.id AND b.month=?)`)
          .bind(id, period.month, period.periodStart, period.periodEnd, period.dueDate, period.amountCents, timestamp, day, row.connectionId, row.version, row.nextMonth, row.nextMonth),
        db.prepare(`UPDATE rental_bill_schedules SET next_month=?,issue='',last_checked_at=?,updated_at=?,updated_by='system',version=version+1,
          last_bill_id=(SELECT id FROM rental_bills WHERE connection_id=? AND month=? AND status='issued' LIMIT 1)
          WHERE connection_id=? AND status='enabled' AND version=? AND next_month=?
          AND EXISTS (SELECT 1 FROM rental_bills WHERE connection_id=? AND month=? AND status='issued')`)
          .bind(next, timestamp, timestamp, row.connectionId, row.nextMonth, row.connectionId, row.version, row.nextMonth, row.connectionId, row.nextMonth),
      ]);
      if (results[0].meta.changes) summary.created++; else summary.skipped++;
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : "";
      await stop(row, /RENTAL_BILL_OVERLAP/.test(text) ? "overlap" : /RENTAL_BILLS_(FULL|DAILY)/.test(text) ? "limit" : "unavailable");
    }
  }
  return summary;
}
