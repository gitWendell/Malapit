# Archived HitPay sandbox experiment

Updated November 23, 2026. The active payment flow now uses [direct owner payment details](direct-owner-payments.md).

Owners save their GCash, Maya, bank, existing receiving QR, cash or other agreed details in My Rentals → Payment setup. Renters use their own wallet or bank app, then submit a payment report for owner confirmation. There is no payment gateway in this flow.

The earlier HitPay integration used one operator-owned Singapore sandbox business and fixed S$1 PayNow mock payments. Hosted checkout, server verification and an actual signed callback returning HTTP 200 were tested. A December bill's real balance remained ₱15,000 because sandbox history was separate from rent records.

New sandbox payment creation and setup now return HTTP 410. Sandbox entry buttons have been removed from ordinary bills and My Rentals. Existing private test receipts and history are retained. The old setup page directs owners to the new receiving-details screen. No real provider collection or owner payout service was activated.

Any future gateway work requires a separately approved live business account, an agreed owner-account and payout arrangement, PHP payment testing and a provider-confirmed ledger with refunds and duplicate-credit protection. It is outside the current direct-payment feature.

Historical primary sources: [HitPay sandbox](https://docs.hitpayapp.com/apis/guide/sandbox), [platform accounts](https://docs.hitpayapp.com/platforms/overview), [event signatures](https://docs.hitpayapp.com/apis/guide/events).
