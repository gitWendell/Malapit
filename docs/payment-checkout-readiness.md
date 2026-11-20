# HitPay checkout readiness

Updated November 20, 2026.

## Current integration

Malapit uses one operator-owned **HitPay Singapore sandbox business** for its first provider integration. `/hitpay-sandbox` is the operator setup page. After setup, issued bills owned by that operator show **Try HitPay test checkout** to their original owner and renter.

Each checkout is a separate fixed **S$1.00 SGD test**. It opens HitPay's actual sandbox checkout. It is not a conversion of the peso rent and cannot settle that rent bill. `hitpay_sandbox_checkouts` is separate from `rental_payments`; no sandbox result enters owner revenue, confirmed payments, pending reports or real balances. Other owners cannot use the operator's business to collect rent.

`/payment-demo` remains a browser-only illustration. `/hitpay-return` checks a provider-created test request. Neither page enables live collection.

## Connection

1. Use HitPay's documented **Singapore sandbox**. This does not establish an overseas business or approve Philippine live collection.
2. Save `HITPAY_SANDBOX_API_KEY` and the **per-webhook endpoint salt** as `HITPAY_SANDBOX_WEBHOOK_SECRET` in Cloudflare Worker encrypted secrets. The API-key page salt belongs to legacy callbacks and is not the event-webhook salt. Never save keys in source, chat, logs or a screenshot.
3. Configure the public nonsecret `HITPAY_SANDBOX_BUSINESS_ID`. Register `https://malapit-test.malapit-ph.workers.dev/api/rentals/hitpay-sandbox/webhook` for `payment_request.completed` and `payment_request.failed`.
4. Sign in as the Malapit operator and open `/hitpay-sandbox`. Enabling the connection checks the configured callback against HitPay's authenticated API and binds the business to that operator's units.
5. Open an issued bill in My Rentals. Acknowledge the test-only amount, then open checkout. Use the active **PayNow sandbox** method. HitPay documents scanning its test QR with a phone camera, not a banking/payment app, to open the mock success flow. Never use a real card or banking app. Cards are not activated in this account because their setup asks for a bank account.
6. Return to Malapit for server verification and a test receipt. The original peso balance must remain unchanged.

The API base and checkout host are hardcoded to sandbox. There is no live-key toggle. Checkout creation is restricted to original bill parties, same-origin submissions and the bound operator's bills. The server creates the amount and reference; browser payment status is ignored. Only an authenticated provider response matching request ID, reference, SGD, S$1 and the sandbox destination can confirm the test. Repeated-payment links, refunded and manually marked transactions fail validation.

Event callbacks use HMAC-SHA256 of the raw JSON bytes with the endpoint's salt, followed by a server-side payment-request lookup. Duplicate callbacks do not credit anything. Repeated clicks reuse an open attempt; failed/expired attempts allow an explicit new attempt. An uncertain creation remains locked against duplicates. A status check searches HitPay for its exact opaque reference and verifies the matching request. Missing or ambiguous results remain on hold for review. Tests are capped at ten per person per Philippine day and 1,000 stored attempts across the site.

## Verification

The deployed Singapore sandbox business was verified against its registered callback, then bound to the operator's units. Hosted PayNow mock payments completed successfully. The deployed callback received an actual provider POST and returned HTTP 200. Malapit also rechecked the provider request on the server. The December bill's real balance stayed **₱15,000**, with no new rent-payment record.

A fresh request opened checkout directly. An earlier uncertain request was recovered by its exact reference without creating a second provider request. There are no real charges, Philippine payouts or active card integration.

Validation includes 132 unit checks, 22 local sandbox route/privacy checks, 50 inquiry-to-rental-to-payment checks and a production build. Local fixtures were removed. Provider test history stays separate from rent history.

## Before real Philippine rent payments

- Complete the appropriate Philippine business registration, provider onboarding and provider approval for a rental marketplace.
- Agree on owner onboarding, account connections, destination and payout rules with HitPay. A single merchant sandbox key is not a multi-owner payout arrangement. HitPay OAuth and platform access need separate provider review.
- Test Philippine payment methods, PHP settlement, fees, refunds, disputes, delayed confirmations and payout outcomes. This Singapore PayNow test does not test GCash, QR Ph or Philippine owner payouts.
- Add a distinct provider-confirmed rent ledger with immutable history and protection against double credit or overpayment when direct-owner payment reports also exist.
- Show the full fee and destination before payment. Owner subscriptions, commissions and renter deductions are not active.

Direct payment to the owner and owner-confirmed payment reports remain available. No real-money collection, automatic deduction or device push payment reminders are enabled.

## Primary documentation checked November 20, 2026

- [HitPay sandbox](https://docs.hitpayapp.com/apis/guide/sandbox)
- [HitPay OpenAPI request and response contract](https://docs.hitpayapp.com/openapi.json)
- [Event webhooks and raw-body signatures](https://docs.hitpayapp.com/apis/guide/events)
- [Platform overview](https://docs.hitpayapp.com/platforms/overview)
- [Owner OAuth connections](https://docs.hitpayapp.com/platforms/oauth)
