# Malapit

A map-based rental marketplace for the Philippines. Renters can browse nearby homes and compare prices. Owners can submit properties, place map pins, upload photos, and manage inquiries. The same account also opens **My Rentals**, a private area for units and accepted owner–renter connections.

[Open the Cloudflare test site](https://malapit-test.malapit-ph.workers.dev/). Public browsing and Google sign-up are enabled. The owner's reviewer access and a real private photo upload have been verified. Read the published [privacy notice](https://malapit-test.malapit-ph.workers.dev/privacy) and [terms of use](https://malapit-test.malapit-ph.workers.dev/terms). A fresh second-account workflow and installation on a physical Android phone still need manual testing.

This standalone test uses **Cloudflare Workers Free + D1 Free**, with **Supabase Free** for Google sign-in and private photos. It has separate data from the original hosted site. Deployment and provider setup are separate steps; working local tests do not mean live account access is configured.

## Features

- OpenStreetMap with linked property cards and price pins, city search, budget and home filters.
- Public browsing, account-owned saved homes, private inquiries and owner replies.
- Four-step property submission with map placement and up to five automatically compressed photos.
- Administrator review, corrections, owner edits, pause, rented and withdrawn states.
- Availability reminders and hiding listings after 14 days without confirmation.
- Approximate-location redaction in the public API and private unpublished photos.
- Phone navigation and Android home-screen installation as a web app.
- Private units with monthly rent, due day and rental dates; seven-day invitations matched to the renter’s current verified sign-in email.
- Owner and renter review, accept/decline, revoke and close connections, with fixed shared details and a dated history. Vacant units can be edited, archived and restored.
- Monthly rent bills with explicit covered dates, exact peso amounts, due dates, private notes and correction history. Owner and renter see the same records, with monthly totals and due-date labels.
- Renter payment reports, owner receipt confirmation, partial balances, cash records and dated corrections. Pending reports stay separate from confirmed amounts.
- Optional monthly bill creation after owner review, with pause controls and manual handling for partial months.
- A private owner review list across units, renter payment shortcuts, and copyable bill messages with private links.
- A phone-friendly [video and written guide](https://malapit-test.malapit-ph.workers.dev/guide), using fictional local demonstration data and English narration.

The 18 sample homes are fictional and labeled. They are separate from submitted listings. Sample inquiries do not contact anyone externally. My Rentals invitations and bills appear inside the app; Malapit does not email them. Owners can create bills manually or opt into full-calendar-month bills after reviewing the rent and dates. Owners check their own original records before confirming receipt. Malapit does not independently verify, collect, hold or transfer money. Repairs, payment-proof uploads, actual payment processing, paid promotions, email/SMS notifications, and automated ownership verification are not implemented.

## Free pilot setup

Follow [the deployment guide](docs/cloudflare-deployment.md) to configure Cloudflare, the separate Malapit Supabase Free project, Google sign-in, private storage, and runtime secrets. **R2 and Cloudflare Access are not required. Do not activate their billing subscriptions.**

Production verifies Supabase session tokens and restricts sign-in to Google. Cookies are secure, HttpOnly, and private. Client identity headers do not authenticate deployed users. `ADMIN_USER_IDS` explicitly names reviewer UUIDs; the first visitor does not become an administrator.

The pilot allows 30 managed properties, five photos per listing, 250 stored/reserved photos, 100 MiB reserved photo storage, and ten upload attempts per person per Philippine day. Photos are JPEG, at most 1600 pixels per side and 400 KiB each. Failed/uncertain uploads keep their storage reservation. These app limits do not cap bandwidth; free provider quotas can interrupt service.

My Rentals separately allows 100 active private units across the test, 30 per owner, and 30 invitations per owner per Philippine day. Units are not public map listings. Listing reviewers have no extra access to private rental records. Accepted access is bound to the renter’s account ID, so a future user of the same email or a replacement renter cannot inherit past records.

Rent bills are limited to 10,000 historical records across the test and 60 creations per owner per Philippine day. Cancelled bills retain their history and still count toward these limits. The database prevents overlapping current covered periods and more than one current bill per connection and billing month. Corrections cancel and replace a bill, preserving the original amount and reason. Cancel a bill only after resolving pending reports and reversing confirmed records with a reason.

Payment records are limited to 20,000 historical entries across the test and 30 creations per person per Philippine day. Cancelled, rejected and reversed entries still count. One pending report is allowed per bill. Database checks prevent confirmation or recording above the current balance and preserve the original amounts, parties, dates, references and action history. Only owner-confirmed records reduce a balance. Reversing a record changes the balance and preserves its history; it does not refund money. Monthly confirmed totals refer to the selected bills, not the date money was received, and are not profit.

Automatic bills are off by default. The owner reviews and enables them per accepted connection for future full calendar months. Partial periods and other rent cycles stay manual. A job checks up to 12 due schedules every five minutes, using at most 49 D1 statements per run to fit the Free plan’s 50-query limit. Existing current bills are preserved; missed months and creation problems need review. Cancelling an automatic bill pauses future creation, and closing a connection stops its schedule. There are no automatic payment deductions. Free provider quotas can interrupt scheduling.

## Run locally

Requires Node.js 22.13 or later.

```sh
npm ci
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev -- --port 5187
```

Open `http://localhost:5187`. Local sign-in uses a fictional account and an emulated photo store, with no provider subscription. Local authentication works only in explicit local mode on loopback HTTP. Never deploy `AUTH_MODE=local`.

Local state stays in ignored `.wrangler/` files, separate from remote data and photos.
My Rentals in local mode includes Owner, Renter and Other user links for checking both sides of an invitation. These fictional account switches are absent from the deployed Supabase flow.

## Check the app

```sh
npm run check
npm test
npm run build
npm start -- --port 5188
```

In a second terminal:

```sh
node scripts/smoke-test.mjs
node scripts/rentals-smoke-test.mjs
node scripts/rental-bills-smoke-test.mjs
node scripts/rental-payments-smoke-test.mjs
node scripts/rental-workload-smoke-test.mjs
```

All five smoke tests are restricted to the built loopback Worker on port 5188. The original test checks authorization, upload validation, private photos, listing review, location privacy, saved homes, inquiries, reports, availability expiry, and listing states. The rental test checks private unit ownership, intended-email invitations, concurrent responses, immutable shared details, expired/revoked invitations, past renter privacy, and archive/restore. The billing test checks scoped access, exact amounts, duplicate requests, overlapping dates, totals, concurrent cancellation and immutable correction history. The payment test checks reports, partial balances, owner confirmation, account isolation, repeated references, reversals and concurrent actions. The workload test checks schedules, the built scheduled handler, private review queues, payment defaults and replacement-renter privacy. It uses a temporary loopback runner without assets to work around Wrangler 4.92’s local Cron dispatch bug; production keeps its normal assets configuration. Each removes only its own temporary records. Never retarget them to a deployed site.

`npm start` uses a separate ignored local config and fictional identities. `npm run deploy` builds and deploys the production configuration. GitHub Actions runs TypeScript checks, automated tests, and a production build; deployment requires the provider setup in the guide.

## Project files

The [rental-management process](docs/rental-management-process-v1.md) describes the full plan. Private units, accepted owner–renter connections, monthly rent bills and owner-confirmed payment records are implemented. Repairs and rent collection remain future work.

- `app/`, `components/`, `lib/`: interface, shared rules, and server routes.
- `db/`, `drizzle/`: D1 schema and append-only migrations.
- `worker/`, `wrangler.jsonc`: Cloudflare entry point and bindings.
- `docs/`: business process, research, and deployment guide.
- `public/tutorial/`: animated MP4, captions, chapters, poster and transcript from fictional local app screens. It includes moving cursor paths, click effects, visible typing, transitions and local Kokoro narration. See [walkthrough production](docs/walkthrough-production.md) for the script and build steps. No paid recording service or speech API is used.

Keep credentials in Cloudflare runtime secrets or ignored local environment files. Do not commit tokens, `.dev.vars`, database files, uploads, or build output. `.openai/hosting.json` has no original Site identity and is retained for the build integration.

## Android and offline behavior

Open the HTTPS site in Chrome on Android and use **Get app** or **Add to home screen**. This installs a web app; a Google Play release is separate. Check installation and Google sign-in on a physical Android device before launch.

The service worker caches only generic offline help. Account pages, APIs, photos, and external map tiles stay on the network. Reconnect to see current rental information.

## Credits and launch limits

The map uses [OpenStreetMap tiles](https://operations.osmfoundation.org/policies/tiles/) for low-traffic testing, with attribution and no bulk or offline downloading. Choose a suitable map provider before scaling. Photo sources are in `public/homes/sources.json`. The self-hosted Figtree font and its SIL Open Font License are in `public/fonts/`. Third-party licenses remain with their files.

Before a commercial launch, complete the operating and legal review in [the business research](docs/rental-business-research.md), define retention and abandoned-upload cleanup, and operate a real listing review process.
