# Monthly owner reports

Available in the free test under **My Rentals → Reports**. Direct link: `/?view=rentals&rentalTab=reports`. There is no paid plan or new payment provider in this feature.

The owner chooses a bill's billing month. A single database statement calculates the unit balances; the page totals cover every matching unit, including units on other pages. Active units with no bill show zero, without implying expected rent or a missed bill. Archived units appear when they have bill history in the selected month. A unit filter applies to the screen and all three downloads. Other accounts, renters of those units and listing reviewers cannot retrieve this owner's report. A person who also owns units can report only their own units.

## What the numbers mean

Current, non-cancelled bill amounts form rent billed. Only currently owner-confirmed payment records form confirmed credit. Pending reports are shown separately and do not reduce balances. Rejected, renter-cancelled and reversed records contribute no confirmed credit. A cancelled bill contributes no billed amount or balance even when its original history is downloaded. Replacement bills are counted once.

These are current balances for bills whose covered period starts in the selected billing month. They are not month-end historical snapshots, a cash-received-by-date report, independently verified bank transactions, profit, expenses or tax calculations. For example, a December receipt against a November bill appears in the November bill report. A later reversal changes the current November report and remains visible in payment history. Amounts are summed in integer cents.

## Downloads

- **Unit summary:** one row per matching unit, with billed, confirmed, remaining and pending amounts. No duplicate grand-total row.
- **Bill records:** every matching original bill, including cancelled bills, with covered dates, due dates, source, cancellation reason, original amount and current contribution to totals.
- **Payment history:** every matching payment record and status, including pending, rejected, cancelled and reversed records. Original amount, current confirmed credit, date paid as reported, references, review dates and correction reasons stay separate. The file is a record snapshot with action dates/reasons, rather than a row for every event in the internal activity log.

Each download is generated on request, includes all matching records across pages and labels its UTC generation time. It groups by the associated bill's billing month. Summary unit labels use current unit details; bill and payment files keep the original connection's property, unit and renter labels. Email addresses, street addresses and unrelated account records are omitted. Downloaded files remain private records on the user's own device and can contain personal and payment-reference information.

Exports are UTF-8 with a BOM, CRLF rows and quoted/escaped fields for Excel. Formula-like untrusted text, including control and full-width variants, receives a protective tab prefix. That prefix intentionally changes the exported cell's text representation, without changing the stored original. CSV protections vary across spreadsheet programs and later transformations; this is not a general-purpose lossless import format. See [OWASP CSV injection guidance](https://community.owasp.org/attacks/CSV_Injection).

## Implementation and limits

`/api/rentals/reports` and `/api/rentals/reports/export` use the current verified private-rental account. The server supplies owner identity to bound queries; a URL cannot select an owner. An explicit foreign unit returns 404. Responses and errors are private/no-store through the existing request wrapper. Exports are generated in memory, with no storage bucket, scheduled export, email or public download link. No schema migration or provider setup is required.

Report pages contain 25 units. The summary read is bounded by the existing 10,000 total historical bills plus 30 active units per owner; exports are bounded by the existing 10,000 bills and 20,000 payment records. A sentinel row detects over-limit data and returns an error instead of a truncated download. Existing owner/month, unit-owner and payment/bill indexes support the scoped reads. Review resource usage before increasing the test limits.

Automated checks execute the actual prepared report queries against the migrated SQLite schema, covering account isolation, pending balances, partial receipts, cancellation/replacement, reversal, archived units, replacement renters and CSV encoding. The local-only report smoke test checks authenticated routes, download headers, unit filters and all-page exports. It creates fictional records and removes only its own fixtures. Never run the smoke test against the public site.
