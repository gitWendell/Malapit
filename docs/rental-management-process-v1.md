# Malapit rental management — process and release scope

Prepared November 16 and updated November 17, 2026, following the owner's request to manage rent and property concerns alongside rental discovery. **My Rentals is part of the same Malapit app and account.** The current release implements private units, rent and date details, intended-email invitations, acceptance/decline, revocation, closed connections, monthly rent bills, owner-confirmed payment records and retained correction history. Repairs and payment collection described below are later stages. The separate fictional dashboard preview and the `/guide` video are demonstrations, not live tenant data.

## Current release

- Owners can add private units and invite an existing renter using that renter’s Malapit Google sign-in email. Invitations appear inside My Rentals; the owner may copy and share a link. No email is sent.
- Only the current verified account matching an unexpired invitation can respond. Invitations expire after seven days. Only one pending or accepted connection is allowed per unit.
- Shared rent, address and dates are fixed on the connection. Revoke a pending invitation or close an accepted connection before editing the vacant unit and sending a new invitation.
- Accepted and closed records stay bound to the original account IDs. A new renter or future holder of an old email cannot see the earlier record. Listing reviewer access does not grant private rental access.
- Closing a Malapit connection preserves history; it does not terminate a lease. The app neither signs an agreement nor collects money.
- The free test allows 100 active private units in total, 30 per owner, and 30 invitations per owner per Philippine day. Public listing limits remain separate.

The first version supports one owner/manager account and one renter account per connection. Shared tenancy participants, deposits, advances and utilities are not recorded as separate financial items yet.

## Monthly bill release — November 17

- The owner creates each month's rent bill inside an accepted, open connection. Nothing is generated or charged automatically.
- The billing month identifies the month in which the covered period starts. Default dates use the calendar month, clipped to the agreed rental dates. Owners can change the coverage for their agreed cycle, such as November 17–December 16, up to 31 days. A partial first/last month starts with an empty amount so the owner enters the agreed charge; no prorating rule is assumed.
- The due date starts with the agreed due day, using the last day in shorter months, and can be reviewed and changed before sharing. Money is stored as integer cents. Only rent is recorded in this release.
- One current bill is allowed per connection and billing month. Current covered periods cannot overlap, including across month boundaries. Concurrent/repeated requests cannot silently create duplicate bills.
- Owner and renter see the same private bill, owner note and history. Monthly totals show **Rent billed**, **Confirmed for these bills** and **Remaining in records**, excluding cancelled bills. Confirmed totals depend on the owner's checks and refer to the selected bills, not when money arrived. They are not profit or independent verification. Due-date counts apply only where a recorded balance remains.
- The owner corrects a bill by cancelling it with a reason and creating a replacement while the connection remains open. Original details and both history events stay visible. Closing a connection stops new bills and preserves existing records for the original parties.
- Bill history is paged by billing month in My Rentals. The connection shows its latest 12 bills; older records remain available through the month selector. Limits are 10,000 historical bills across the test and 60 creations per owner per Philippine day. Cancelling does not reset the limits.

## Payment-record release — November 17

- The renter reports a payment already made directly to the owner, with an amount, method, date, reference and optional note. Reference is required for GCash, Maya and bank transfers. There are no proof-image uploads or automatic transfers.
- One **Awaiting confirmation** report per bill is allowed. It stays separate from confirmed amounts and does not reduce the balance. The owner checks original cash, bank or wallet records before confirming, or requests a correction with a reason. The renter may cancel their own pending report with a reason.
- The owner can record money already received, including cash, with an explicit receipt check. Partial payments reduce the balance only after owner confirmation. The database rechecks the balance on every confirmation or owner receipt so concurrent actions cannot create an overpayment.
- Only the owner may reverse a confirmed record, with a reason. The original amount, parties, dates, reference, confirmation and correction history stay visible. A reversal changes the recorded balance; it does not return money. A bill must have no pending or confirmed payments before cancellation for correction.
- A reference already used on another confirmed record for this owner and payment method requires an owner explanation before confirmation. The cross-bill flag is visible only to the owner and does not declare fraud. The explanation is part of the shared payment record.
- Limits are 20,000 historical payment entries across the test and 30 creations per person per Philippine day. Rejected, cancelled and reversed records still count. History is paged 20 entries at a time. Listing reviewers have no bypass; access stays with the bill's original owner and renter, including after a connection closes.
- The public `/guide` page includes a 16-scene phone walkthrough with English narration, captions and a transcript. All demonstrated accounts, addresses and amounts are fictional and were created only in local development.

## Purpose and first scope

Help owners manage existing rentals and help renters keep track of their own rent and concerns. Owners may add an existing tenant even when that person found the property elsewhere. Map listings and private rental-management records are separate: adding a unit or tenant does not publish a listing.

The management workflow includes units, accepted owner–renter connections, agreed rent and due dates, monthly bills, manual payment records, owner confirmation and an activity history. Repair requests are the next planned stage. Due-date reminders are visible inside the app. Email, SMS, push notifications, automatic monthly generation, money collection, automatic deductions, electronic signatures and paid management plans require later work.

## People and access

| Person | Access |
| --- | --- |
| Owner or authorized manager | Only the properties they manage, their connected tenancies, bills, payment submissions and repair requests. |
| Renter | Only their accepted tenancies, their bills and payment records, and the repair requests shared with that tenancy. |
| Public visitor | Published rental listings; no tenant names, balances, payment proof, agreements or repair details. |
| Support/reviewer | Listing review stays separate. Financial and tenancy records need explicitly authorized, limited access for a particular support case. |

A person may be an owner for one property and a renter elsewhere. A public listing, an inquiry, or knowledge of someone's email is not permission to access their private tenancy. Reassigning a unit to a new renter must not disclose the previous renter's records. Ending access and retaining records for the original parties are separate operations.

## 1. Add the property and unit

The owner creates a private property record and its independently rented units, rooms or beds. Each unit has its own agreed tenancy. A shared apartment can have one agreement with several named participants, or separate agreements for separately rented beds; record the actual arrangement. Do not bill every participant the full rent when they share one agreement.

Record unit name, rent in Philippine pesos, rent period, due date, lease dates and the owner's contact details. Record security deposits, advance rent and utilities separately from normal rent. An advance must be allocated to a named billing period before reducing its rent balance. A deposit is not rent collected.

## 2. Connect the renter

1. The owner prepares an invitation with the unit, renter's account email, start date, rent, billing frequency and due date.
2. The renter signs in and checks the details before accepting or declining. The invitation is intended for that account, expires if unused, and can be revoked by the owner. There must be no public list of invited email addresses.
3. Acceptance creates access to the rental-management record. It does not automatically sign a lease or authorize payment deductions.
4. The owner and renter arrange and confirm their agreement. Publication availability is updated separately when the owner confirms that the advertised property is rented.

The first interface should make an existing tenant as easy to add as a tenant found through Malapit. Multiple people may share an agreement, but one confirmed bill must not become several separate debts.

## 3. Create the monthly bill

After the connection and agreed billing details are confirmed, create one rent bill for each tenancy and billing period. State the covered period, due date, rent amount, any clearly agreed additional items and remaining balance. Prevent duplicate generation for the same period. Display dates in Philippine time.

Make the first partial month's charge explicit; do not silently assume a prorating rule. For a due day that does not occur in a shorter month, show and agree the last-day-of-month rule. Apply rent changes to future bills using the agreed terms; preserve issued bills and record corrections as dated adjustments rather than silently overwriting history.

Core rent-balance calculation:

`Remaining rent = billed rent + approved debit adjustments − approved credits/advance allocations − confirmed rent payments + payment reversals`

Pending or rejected submissions do not reduce this balance. An overdue label identifies an unpaid amount past its due date. It does not automatically impose a penalty, authorize an eviction, or prove a legal default. Automatic late fees are outside the first release.

## 4. Record a payment made directly to the owner

1. The renter selects a bill and records the amount, method, date, reference and optional note. Keep original receipts outside the app; optional private proof uploads are a later feature. Cash can also be recorded by the owner after checking their own records.
2. The submission becomes **Awaiting confirmation**. Its amount is visible separately from confirmed payments. Screenshot upload alone never marks a bill paid.
3. The owner checks their original bank, wallet or cash records, then confirms the payment or requests a correction with a reason. Each submission can be confirmed once. Both people see the actor, date and decision.
4. A confirmed partial payment produces **Partly paid** and leaves the remaining amount due. Full confirmation produces **Paid**. Keep an overdue indication when a partial balance is past due.
5. A rejected submission remains in the history, with its reason; the renter can submit corrected information. Do not erase a rejected or confirmed record. A correction to a confirmed payment creates a dated reversal/adjustment with a reason.

For the first release, prevent a second unreviewed submission against the same bill. Check the current balance again when confirming so an old submission cannot create an unnoticed overpayment. A duplicate reference should be flagged for review; it is not by itself proof of fraud. Unexpected extra amounts need an explicit credit or refund decision.

The resulting in-app record states **Confirmed by owner**. It is not a claim that Malapit processed the transfer or that a screenshot is independent payment verification. Handle deposit returns and deductions in a separate record and agreement.

## 5. Handle repairs and other concerns

The renter chooses their unit, describes a concern and may attach a private photo. The owner acknowledges it and records updates. Both sides can follow: **Open → Acknowledged → In progress → Resolved**. The renter may reopen an issue that continues. Keep the update history instead of replacing it with the latest message.

An issue does not automatically reduce rent, order a contractor, create a charge or change the tenancy. Agreed costs require a separate, visible record. Show the owner's existing contact option for urgent problems; an in-app request is not a promise of immediate emergency response.

## 6. What each dashboard shows

| Owner workspace | Renter workspace |
| --- | --- |
| Property units, current tenants and invitations | Their home, owner contact and agreed rent details |
| Expected rent for a selected period | Current bill, covered period, amount and due date |
| Confirmed collections, remaining balances and overdue amounts | Their confirmed payments, remaining amount and pending submissions |
| Submissions awaiting owner confirmation | Payment record and any correction requested |
| Open repairs and progress updates | Their repair requests and updates |
| Dated activity and exportable records | Their own history and downloadable records |

Separate expected rent, confirmed collections and owner expenses. Do not label expected rent or deposits as profit. Keep transfers confirmed by the owner distinct from future provider-confirmed payments and provider settlement to the owner.

## 7. Move-out and corrections

The owner and renter record the actual end date. Stop generating future rent bills after the agreed end. Preserve access to the original parties' own records, pending corrections and agreed final balances. Record any deposit reconciliation separately. A future tenant gets a new tenancy and no access to earlier private history. Re-listing the vacancy is a separate owner action.

Disputed facts remain labeled as disputed and go to a defined support process. The app does not decide a housing dispute from an unverified payment claim. Support changes must be scoped, explained and recorded.

## 8. Payment collection and optional automatic payments later

Choose a provider only after it confirms support for Malapit's landlord/platform model, rental use case, owner onboarding and settlement arrangement. The intended model is provider-managed payment collection and settlement to approved owners, with Malapit's management revenue identified separately. Define failed payments, duplicate charges, reversals, refunds and disputed payments before enabling live collection.

Monthly bill generation and automatic payment deductions are different features. A renter may receive a recurring bill and choose to pay it manually. Optional automatic deductions need clear authorization of amount, frequency, start/end, cancellation and changes. Keep variable utilities separate from a fixed-rent authorization unless the provider and renter's authorization cover them. A failed charge leaves the bill unpaid; record retries without producing duplicate collections.

PayMongo currently documents card/Maya recurring methods and requires account configuration. Its linked-account platform model requires an approved registered parent business; owners must complete the relevant onboarding. These are provider requirements, not confirmation that Malapit has been approved. Confirm available methods, fees and platform terms before integration.

## Business income proposal

Keep rental discovery and the initial management test free. Test whether owners find enough recurring value to pay for an optional monthly plan based on managed units. Separate the management-plan price from payment-processing charges and separately priced message channels. Pricing, fee allocation, paid tiers and refund terms are still business decisions; no price or subscription is activated by this plan.

Measure bills acknowledged, time spent checking payments, unresolved corrections, owner replies and repair resolution. Use those results and actual service costs to decide whether to introduce a paid plan.

## Acceptance checks before a live management release

- An owner can connect an existing tenant; only the intended account can accept. A declined, expired or revoked invitation grants no access.
- Monthly generation cannot duplicate a bill. Short months, first/last periods, partial payments, advances and ended tenancies produce the agreed amounts.
- A pending payment report leaves confirmed totals unchanged. Confirmation updates both dashboards once; rejection requires a reason. Duplicate submissions, overpayments and corrections preserve history.
- A renter cannot see another tenancy, and an unrelated owner or public visitor cannot read private records or proof. New tenants cannot inherit old records. Listing review does not silently grant financial access.
- Repair creation and updates appear to the correct parties; reopening retains earlier updates.
- Phone layouts work for renter and owner. In-app reminders describe their actual delivery; SMS/email/push are not implied.
- Private-proof and issue-photo storage, retention, account deletion, access/export requests and costs have an operating process. Financial documents must not use the current public-listing photo access rules unchanged.
- Keep the public privacy notice and terms matched to the data and services actually provided. The owner has authorized the current connection feature and publication of the app; obtain a new decision before adding financial services, paid terms or a new use of personal information.

## Preview and implementation handoff

The separate clickable preview uses fictional accounts, one sample property, November 2026 bills, manual payment submissions and repair tickets. Owner and renter views share the example state so confirmation and issue updates can be followed. It does not call the live app, move money, upload real evidence or send messages.

Accepted rental records, permissions, monthly rent bills and payment submissions/confirmation are implemented. Repair requests are next. Add gateway collection only after the provider and business arrangements are approved. The existing map and listings remain the public discovery area of the same app throughout.

## Sources checked November 16, 2026

- [PayMongo recurring payments](https://docs.paymongo.com/docs/payment-acceptance-subscriptions)
- [PayMongo linked accounts and onboarding requirements](https://docs.paymongo.com/docs/account-settings-linked-accounts)
- [PayMongo published pricing](https://www.paymongo.com/en/pricing)
- [Xendit Philippines subscription activation and payment methods](https://help.xendit.co/hc/en-us/articles/4408498827545--PH-How-to-activate-subscription-payments-for-my-business)
