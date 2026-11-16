# Malapit rental management — proposed process

Prepared November 16, 2026. This is the next product plan, following the owner's request to manage rent and property concerns alongside rental discovery. The live app still provides discovery, listings and inquiries. This document and its fictional dashboard preview do not enable payments, send invitations or change live tenant records.

## Purpose and first scope

Help owners manage existing rentals and help renters keep track of their own rent and concerns. Owners may add an existing tenant even when that person found the property elsewhere. Map listings and private rental-management records are separate: adding a unit or tenant does not publish a listing.

The first management release should include units, accepted owner–renter connections, agreed rent and due dates, monthly bills, manual payment records, owner confirmation, an activity history and repair requests. Reminders are visible inside the app. Email, SMS, push notifications, money collection, automatic deductions, electronic signatures and paid management plans require later work.

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

1. The renter selects a bill and records the amount, method, date, reference and optional private proof. Cash can also be recorded by the owner after checking their own records.
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
- A pending screenshot leaves confirmed collections unchanged. Confirmation updates both dashboards once; rejection requires a reason. Duplicate submissions, overpayments and corrections preserve history.
- A renter cannot see another tenancy, and an unrelated owner or public visitor cannot read private records or proof. New tenants cannot inherit old records. Listing review does not silently grant financial access.
- Repair creation and updates appear to the correct parties; reopening retains earlier updates.
- Phone layouts work for renter and owner. In-app reminders describe their actual delivery; SMS/email/push are not implied.
- Private-proof and issue-photo storage, retention, account deletion, access/export requests and costs have an operating process. Financial documents must not use the current public-listing photo access rules unchanged.
- Update the public privacy notice and terms to match the new data and services, and obtain the operator's approval before publishing those changes.

## Preview and implementation handoff

The separate clickable preview uses fictional accounts, one sample property, November 2026 bills, manual payment submissions and repair tickets. Owner and renter views share the example state so confirmation and issue updates can be followed. It does not call the live app, move money, upload real evidence or send messages.

After reviewing this process and preview, implement accepted tenancy records and permissions first, then bills, payment submissions/confirmation and repairs. Add gateway collection only after the provider and business arrangements are approved. The existing map and listings remain a separate discovery feature throughout.

## Sources checked November 16, 2026

- [PayMongo recurring payments](https://docs.paymongo.com/docs/payment-acceptance-subscriptions)
- [PayMongo linked accounts and onboarding requirements](https://docs.paymongo.com/docs/account-settings-linked-accounts)
- [PayMongo published pricing](https://www.paymongo.com/en/pricing)
- [Xendit Philippines subscription activation and payment methods](https://help.xendit.co/hc/en-us/articles/4408498827545--PH-How-to-activate-subscription-payments-for-my-business)
