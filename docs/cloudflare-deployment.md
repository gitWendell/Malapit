# Free pilot deployment

Use **Cloudflare Workers Free + D1 Free** for the app and rental data, and **Supabase Free** for Google sign-in and private photos. Keep the separate Malapit organization on Free. This environment starts with new data; it does not copy accounts or submissions from the original hosted site.

Do not activate Cloudflare R2, Zero Trust checkout, a paid Workers plan, Supabase Pro, paid branches, or paid add-ons for this pilot. The local photo emulator does not need an R2 subscription.

## 1. Prepare Cloudflare

```sh
npm ci
npx wrangler login
npx wrangler whoami
```

Finish the browser approval promptly. If the local callback expires or refuses the connection, restart login. Never paste account tokens into GitHub or this guide.

The repository already identifies the dedicated `malapit-test-db` D1 database. If setting up another environment, create a new database and update `wrangler.jsonc`:

```sh
npx wrangler d1 create malapit-test-db
npm run deploy:check
```

Keep `AUTH_MODE` set to `supabase`. Production has no R2 binding. Confirm the account's Workers plan is Free before deployment.

## 2. Prepare Supabase Free

Use the existing project in the **Malapit** organization, not a project in another organization. Confirm its plan is Free. Do not create a duplicate project just to fix a connector permission error; reconnect the integration with access to Malapit instead.

Create a **private** Storage bucket named `malapit-photos`, with:

- Public access disabled.
- Maximum file size: **409600 bytes** (400 KiB).
- Allowed MIME type: **image/jpeg**.
- No anonymous or authenticated client upload, download, update, or delete policies.

The Worker uses a server secret key to access the bucket. Browsers receive only application photo paths. Owners and the reviewer can view unpublished photos; everyone else can view them only while a referenced listing is published and its availability is current.

In Authentication, configure Google using the official [Google sign-in guide](https://supabase.com/docs/guides/auth/social-login/auth-google). The Google OAuth client needs the callback shown by Supabase, normally `https://<project-ref>.supabase.co/auth/v1/callback`. Keep its client secret inside the provider settings. Configure the OAuth consent screen for the intended testers or public users; Google's testing restrictions apply until its publishing requirements are met.

Use Google sign-in for this pilot. Supabase's default email service has [testing restrictions](https://supabase.com/docs/guides/auth/rate-limits) and is not a public email signup service. Disable unused providers and anonymous sign-in.

## 3. Deploy and connect runtime secrets

```sh
npm run deploy
```

The command builds, applies pending D1 migrations, and publishes the Worker and static assets. Save the returned HTTPS `workers.dev` URL. Before provider configuration is complete, visitors can browse; account actions remain unavailable.

In Supabase Authentication URL Configuration, set that URL as the Site URL and allow its exact `/auth/callback` URL. The app adds a same-site `return_to` query parameter for navigation. Follow Supabase's redirect matching rules and verify callbacks for both saved homes and owner management; avoid a broad wildcard covering other hosts.

Get the project's API URL, publishable key, and a modern server **secret key** from Supabase's API settings. Store them only in Cloudflare runtime secrets:

```sh
npx wrangler secret put SUPABASE_URL --config wrangler.jsonc
npx wrangler secret put SUPABASE_PUBLISHABLE_KEY --config wrangler.jsonc
npx wrangler secret put SUPABASE_SECRET_KEY --config wrangler.jsonc
```

Use the `sb_secret_...` key only on the server. Do not put it in browser code, a `VITE_`/`NEXT_PUBLIC_` variable, source files, build artifacts, logs, or GitHub. The Google client secret is separate and stays in Supabase's Google provider settings.

Sign in to Malapit with the owner's Google account. Find its UUID under Supabase Authentication → Users, then configure that exact UUID as the reviewer:

```sh
npx wrangler secret put ADMIN_USER_IDS --config wrangler.jsonc
```

For multiple reviewers, use comma-separated UUIDs. The first visitor does not become an administrator. An email address or editable profile name cannot grant review access.

## 4. Verify before inviting testers

- Signed out: map and sample homes load; saving, submitting, and messaging require sign-in.
- Complete real Google sign-in, reload saved homes, then sign out. Verify this on an Android device too.
- Only configured reviewer UUIDs can open the review queue.
- A second account can upload photos and submit a fictional property. Submission remains private until reviewed.
- An unrelated account cannot open its pending photo URL or read its inquiries. After approval, published photos are visible publicly.
- Confirm owner replies, approximate locations, availability expiry, pause, rent, withdrawal, and resubmission.
- Check the reviewer usage panel and provider dashboards. App counters do not measure the entire account's traffic or bill.
- Withdraw test listings and remove unused uploads before inviting real owners. Built-in example homes remain clearly fictional.

## Pilot limits and cleanup

The server and database enforce:

- **30 managed properties** in total, including pending, paused, and correction listings. Rented and withdrawn listings release a place; reopening them needs free capacity.
- **5 photos per property**, automatically resized in the browser to JPEG, at most 1600 pixels on either side and 400 KiB each.
- **250 stored/reserved photos and 100 MiB reserved photo bytes** across the pilot. All uploads count, including unused or uncertain uploads.
- **10 upload attempts per owner per Philippine calendar day**. Deleting an upload does not reset the daily limit.

Each external upload reserves capacity in D1 first. Failed uploads retain that reservation because the storage result may be uncertain. Cancelling a form removes its new unused photos when deletion succeeds. A photo referenced by any listing cannot be deleted through the upload API.

The reviewer can withdraw unsuitable listings to release property places. Withdrawal preserves the record and photos. There is no automatic retention job yet. To recover abandoned or failed uploads, inspect their D1 records and corresponding Storage objects, confirm they are unreferenced, remove the objects through Supabase Storage, and release the D1 reservations only after deletion is confirmed. Never delete `storage.objects` rows directly.

These limits reduce storage use. They do not cap bandwidth or replace provider quotas. Heavy browsing can still exhaust the free transfer/request allowance, causing the test site to become unavailable. Keep both organizations/accounts on Free; do not upgrade automatically to keep a busy test online.

## Provider limits

Checked November 12, 2026:

- Workers Free: 100,000 requests/day, 10 ms CPU/request. A successful local build does not prove deployed requests fit that CPU budget.
- D1 Free: 5 million rows read/day, 100,000 rows written/day, and 5 GB total storage. Requests fail when free quotas are exhausted.
- Supabase Free: 50,000 monthly active users, 500 MB database, 1 GB file storage, 5 GB egress, and 5 GB cached egress. Free projects may pause after one week of inactivity. Free quota restrictions can interrupt the pilot.

Sources: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [Supabase pricing](https://supabase.com/pricing), [Supabase billing FAQ](https://supabase.com/docs/guides/platform/billing-faq).

## Updates and recovery

Push normal commits to `main`; GitHub Actions checks the source. Run `npm run deploy` from a trusted machine after checks pass. Automatic deployments are not enabled. Cloudflare secrets stay outside GitHub.

Keep migrations append-only. Back up the database before destructive changes. A Worker rollback does not reverse a database migration or restore deleted photos. Supabase and D1 backups/retention are separate responsibilities.
