# Malapit

A map-based rental marketplace for the Philippines. Renters can browse nearby homes and compare prices. Owners can submit a property, place its map pin, upload photos, and manage inquiries.

This repository is the standalone Cloudflare version. It starts with a new database and photo bucket; it does not contain the original hosted site's accounts, submissions, database files, or credentials.

## What works

- OpenStreetMap, linked property cards and price pins, city search, budget and home filters.
- Public browsing, account-owned saved homes, private inquiries and owner replies.
- Four-step listing submission with map placement and JPEG/PNG/WebP photos up to 5 MB.
- Administrator review, corrections, owner edits, pause and rented states.
- Availability reminders and hiding listings after 14 days without confirmation.
- Approximate-location redaction in the public API.
- Phone navigation and Android home-screen installation as a web app.

The 18 sample homes are fictional and labeled. They are separate from submitted listings. Sample inquiries do not contact anyone externally. Paid promotions, payments, email/SMS inquiry notifications, and automated ownership verification are not implemented.

## Account setup for testing

Browsing is public. The test sign-in uses Cloudflare Access with email codes on **`/auth/signin` only**. The Worker verifies the signature, issuer, audience, expiry, and user claims of the Access application token before granting account access. It also verifies the signed `CF_Authorization` cookie on public API routes. Client-supplied identity headers never authenticate a deployed user.

`ADMIN_EMAILS` explicitly names the reviewer account. The first visitor does not become an administrator. Until the provider is connected, browsing works and account actions remain unavailable.

Cloudflare Access is suitable for this small test, with a free plan limited to 50 users. Move to consumer authentication before a larger public launch. See [Cloudflare setup](docs/cloudflare-deployment.md) for resources, sign-in, limits, and deployment.

## Run locally

Requires Node.js 22.13 or later.

```sh
npm ci
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev -- --port 5187
```

Open `http://localhost:5187`. The local sign-in button uses a fictional development account. Local authentication is explicitly restricted to loopback HTTP. Never put `AUTH_MODE=local` into a deployed Worker.

Local state is stored in ignored `.wrangler/` files. It is separate from the remote database and bucket.

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
```

The smoke test runs only against the built loopback Worker on port 5188. It exercises authorization, uploads, listing review, location privacy, saved homes, inquiries, reports, expiry, reconfirmation, and rented states. It removes its temporary database records. Never retarget it to a deployed site. `npm start` is deliberately a local Worker, with explicit fictional test identities; use `npm run deploy` for Cloudflare hosting.

GitHub Actions runs TypeScript checks, authentication/availability/web-app tests, and a production build on pushes and pull requests. Deployment is separate and requires the account setup in the guide.

## Hosting and project files

- `app/`, `components/`, `lib/`: interface, shared rules, and server routes.
- `db/`, `drizzle/`: D1 schema and append-only migrations.
- `worker/`, `wrangler.jsonc`: Cloudflare entry point and bindings.
- `docs/`: business process, research, and deployment guide.

Keep credentials in Cloudflare runtime secrets or ignored local environment files. Do not commit API tokens, `.dev.vars`, database files, uploads, or build output. The preserved `.openai/hosting.json` has no original Site identity and is retained only for the build integration.

## Android and offline behavior

Open the HTTPS site in Chrome on Android and use **Get app** or **Add to home screen**. This installs a web app; a Google Play release is separate. Verify installation and sign-in on a physical Android device before launch.

The service worker caches only generic offline help. Account pages, APIs, photos, and external map tiles stay on the network. Reconnect to see current rental information.

## Credits and launch limits

The map uses [OpenStreetMap tiles](https://operations.osmfoundation.org/policies/tiles/) for low-traffic testing, with attribution and no bulk or offline downloading. Choose a suitable map provider before scaling. Photo sources are in `public/homes/sources.json`. The self-hosted Figtree font and its SIL Open Font License are in `public/fonts/`. Third-party licenses remain with their files.

Before a commercial launch, complete the legal and operating review in [the business research](docs/rental-business-research.md), define retention and abandoned-upload cleanup, and operate a real listing review process.
