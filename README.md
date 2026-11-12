# Malapit

A map-based rental marketplace for the Philippines. Renters can browse nearby homes and compare prices. Owners can submit properties, place map pins, upload photos, and manage inquiries.

This standalone test uses **Cloudflare Workers Free + D1 Free**, with **Supabase Free** for Google sign-in and private photos. It has separate data from the original hosted site. Deployment and provider setup are separate steps; working local tests do not mean live account access is configured.

## Features

- OpenStreetMap with linked property cards and price pins, city search, budget and home filters.
- Public browsing, account-owned saved homes, private inquiries and owner replies.
- Four-step property submission with map placement and up to five automatically compressed photos.
- Administrator review, corrections, owner edits, pause, rented and withdrawn states.
- Availability reminders and hiding listings after 14 days without confirmation.
- Approximate-location redaction in the public API and private unpublished photos.
- Phone navigation and Android home-screen installation as a web app.

The 18 sample homes are fictional and labeled. They are separate from submitted listings. Sample inquiries do not contact anyone externally. Payments, paid promotions, email/SMS notifications, and automated ownership verification are not implemented.

## Free pilot setup

Follow [the deployment guide](docs/cloudflare-deployment.md) to configure Cloudflare, the separate Malapit Supabase Free project, Google sign-in, private storage, and runtime secrets. **R2 and Cloudflare Access are not required. Do not activate their billing subscriptions.**

Production verifies Supabase session tokens and restricts sign-in to Google. Cookies are secure, HttpOnly, and private. Client identity headers do not authenticate deployed users. `ADMIN_USER_IDS` explicitly names reviewer UUIDs; the first visitor does not become an administrator.

The pilot allows 30 managed properties, five photos per listing, 250 stored/reserved photos, 100 MiB reserved photo storage, and ten upload attempts per person per Philippine day. Photos are JPEG, at most 1600 pixels per side and 400 KiB each. Failed/uncertain uploads keep their storage reservation. These app limits do not cap bandwidth; free provider quotas can interrupt service.

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

The smoke test is restricted to the built loopback Worker on port 5188. It checks authorization, upload validation, private photos, listing review, location privacy, saved homes, inquiries, reports, availability expiry, and listing states. It cleans up its own records and photos. Never retarget it to a deployed site.

`npm start` uses a separate ignored local config and fictional identities. `npm run deploy` builds and deploys the production configuration. GitHub Actions runs TypeScript checks, automated tests, and a production build; deployment requires the provider setup in the guide.

## Project files

- `app/`, `components/`, `lib/`: interface, shared rules, and server routes.
- `db/`, `drizzle/`: D1 schema and append-only migrations.
- `worker/`, `wrangler.jsonc`: Cloudflare entry point and bindings.
- `docs/`: business process, research, and deployment guide.

Keep credentials in Cloudflare runtime secrets or ignored local environment files. Do not commit tokens, `.dev.vars`, database files, uploads, or build output. `.openai/hosting.json` has no original Site identity and is retained for the build integration.

## Android and offline behavior

Open the HTTPS site in Chrome on Android and use **Get app** or **Add to home screen**. This installs a web app; a Google Play release is separate. Check installation and Google sign-in on a physical Android device before launch.

The service worker caches only generic offline help. Account pages, APIs, photos, and external map tiles stay on the network. Reconnect to see current rental information.

## Credits and launch limits

The map uses [OpenStreetMap tiles](https://operations.osmfoundation.org/policies/tiles/) for low-traffic testing, with attribution and no bulk or offline downloading. Choose a suitable map provider before scaling. Photo sources are in `public/homes/sources.json`. The self-hosted Figtree font and its SIL Open Font License are in `public/fonts/`. Third-party licenses remain with their files.

Before a commercial launch, complete the operating and legal review in [the business research](docs/rental-business-research.md), define retention and abandoned-upload cleanup, and operate a real listing review process.
