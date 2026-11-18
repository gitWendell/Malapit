# Online rent payments — readiness and next steps

Updated November 18, 2026. This stage previews the proposed payment flow ahead of provider integration and approval for live collection.

## What is available now

`/payment-demo` is an account-free, browser-only illustration using a fixed fictional bill. It previews a reminder, prefilled bill, method choice, simulated approval, delayed confirmation, a failed payment/retry and the owner's proposed view. It makes no payment API request, asks for no financial details or notification permission, saves no payment record and changes no real balance. Its labels stay explicit about the demo in every state. The guide links to it.

This is not a Stripe or PayMongo sandbox integration. A provider test account and its test credentials are still required for that stage. Real rent collection and device push reminders are not active. Existing bills continue to use owner-confirmed records.

## Provider decision

Stripe's standard merchant availability list does not include the Philippines. Do not assume a Philippine business can create a normal Stripe account, or recommend creating an overseas company as a quick workaround. An existing eligible overseas business would need a separate review of platform and owner-payout eligibility.

For the Philippine launch, assess PayMongo Hosted Checkout v2 together with its approved linked-account arrangement. The parent platform must be an eligible registered business and obtain linked-account approval. Owners need the applicable identity, payment-method and payout setup. Confirm explicitly with PayMongo that the rental marketplace model and the intended flow to each owner are supported; an ordinary checkout account does not establish that approval.

The provider must route and account for each owner's money through the approved arrangement. Malapit's management revenue, payment-processing fees and owner payouts must be clearly separated. Agree who pays the fees before live collection and show the final amount before authorization. No real payment provider or paid service has been activated by this update.

## Next stage: provider test mode

1. The operator creates their own provider account and makes test credentials available through encrypted server settings, never chat or the repository. The operator completes identity, account agreements and activation themselves.
2. Integrate hosted test checkout with a private bill and the correct original renter/owner. Load the amount and destination on the server; show a receipt when an already-paid bill is opened.
3. Verify signed provider events, mode, currency, amount, owner account and checkout-to-bill mapping. Duplicate callbacks and repeated clicks must not create duplicate credits. Do not mark a bill paid merely because a browser opens its success URL.
4. Keep provider-confirmed records separate from owner-confirmed manual records, with immutable original history. Pending/failed results leave the balance unchanged. Handle later refunds, disputes, partial payments and payout outcomes explicitly.
5. Test expiry, abandonment, retries, failed payments, duplicate events and two simultaneous attempts before enabling any live key. Show processing/confirmation separately from bank payout status.

PayMongo documents test-mode cards and e-wallet approval pages. Its QR Ph test documentation specifically warns that scanning and paying a generated QR code can process a real transaction: use only the documented test URL, not a real banking/wallet scan. Begin with test cards and simulated e-wallet approval, not QR scans.

## Optional push reminders

A future opt-in reminder opens the exact private payment page and preserves that destination through sign-in when needed. Recheck the current bill; a paid bill opens its receipt. Keep an in-app payment entry available because browser delivery is not guaranteed. Use discreet notification text by default, account-scoped subscriptions and a clear unsubscribe option. Do not retain a previous user's reminders after sign-out/account change on a shared device. Reminders do not authorize automatic deductions.

## Sources checked November 18, 2026

- [Stripe availability](https://stripe.com/global)
- [PayMongo account capabilities and linked-account prerequisites](https://docs.paymongo.com/docs/account-settings-account-capabilities)
- [PayMongo linked accounts](https://docs.paymongo.com/docs/account-settings-linked-accounts)
- [Hosted Checkout v2](https://docs.paymongo.com/docs/payment-channels-hosted-checkout)
- [Test payments and the QR Ph warning](https://docs.paymongo.com/docs/payment-acceptance-testing)
- [Provider webhook setup and signatures](https://docs.paymongo.com/docs/developer-tools-webhook-setup-management)
- [PayMongo pricing](https://www.paymongo.com/pricing)
- [Notification click behavior](https://web.dev/articles/push-notifications-notification-behaviour)
- [Notification permission experience](https://web.dev/articles/push-notifications-permissions-ux)
