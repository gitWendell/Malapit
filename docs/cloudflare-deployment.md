# Cloudflare testing deployment

Use a Cloudflare Worker, D1 database, and private R2 photo bucket. This guide creates a separate test environment; it does not migrate the original hosted site's data.

## 1. Connect Cloudflare

```sh
npm ci
npx wrangler login
npx wrangler whoami
```

Complete sign-in and approve Wrangler in the browser. Wrangler's local OAuth callback expires after two minutes; if `localhost:8976` refuses the connection after a delay, run login again and finish promptly. Never paste tokens into GitHub or commit credentials.

## 2. Create test storage

Keep the Workers account on its **Free** plan. Do not enable a paid Workers subscription for this test.

```sh
npx wrangler d1 create malapit-test-db
```

Copy the returned `database_id` into the `DB` entry in `wrangler.jsonc`. Database identifiers are configuration, not credentials.

Enable R2 in the Cloudflare dashboard if the account has not already activated it. R2 activation may require a payment method and subscription checkout, even when testing stays within its free allowance. The account owner must review and accept that billing setup. Do not activate it assuming there is a hard zero-cost spending cap.

```sh
npx wrangler r2 bucket create malapit-test-photos
npm run deploy:check
```

Leave the bucket private. The app serves uploaded photos through its API. Do not enable a public `r2.dev` bucket URL.

## 3. Publish the app and connect sign-in

```sh
npm run deploy
```

This builds the Worker, applies pending D1 migrations, and uploads the Worker and assets. The placeholder database ID is rejected. It does not upgrade the account plan. Save the returned `workers.dev` URL.

Browsing works after the database is ready. Saving, messaging, uploading, and listing require a verified account; before the following setup, sign-in is unavailable and forged identity headers grant no access.

In Cloudflare One, choose the Free plan and enable **One-time PIN** as a login method. Create a hostname-based, self-hosted Access application for the test Worker's hostname, with path **`/auth/signin`**. Protect only that path so everyone can browse the map. Do not use the whole-Worker “Require authentication” setting for this public test.

For the public sign-up test, use an **Allow** policy with **Include → Login Methods → One-time PIN**. This admits users who verify their email. Do not use a Bypass policy. Set an application session duration such as 24 hours.

Configure the Access application cookie with **HttpOnly enabled**, **SameSite=Lax**, and **Cookie Path Attribute disabled**. The signed application cookie must reach `/api/` as well as the sign-in path. Copy the application's Audience (AUD) tag and the team's HTTPS domain, such as `https://your-team.cloudflareaccess.com`.

Store these values using the prompts below. `ADMIN_EMAILS` is a comma-separated list of reviewer email addresses; use the same verified email that the owner will sign in with.

```sh
npx wrangler secret put ACCESS_TEAM_DOMAIN --config wrangler.jsonc
npx wrangler secret put ACCESS_AUD --config wrangler.jsonc
npx wrangler secret put ADMIN_EMAILS --config wrangler.jsonc
```

Never store secret values in this document or the repository. Redeploy if required after changing bindings or authentication settings.

## 4. Verify before sharing

- In a signed-out browser, confirm that the map loads and account actions ask for sign-in.
- Sign in through `/auth/signin`, verify an email code, and check that saved homes remain after reload.
- Confirm that only the configured administrator sees review controls.
- With a separate owner account, upload a photo and submit a fictional listing. It must remain pending until approved by the administrator.
- Check inquiry privacy, owner replies, sign-out, and an Android-sized layout.
- Remove test listings or mark them rented before inviting real owners. Built-in sample homes remain clearly fictional.

## Free limits and costs

Checked against Cloudflare documentation on November 12, 2026:

- Workers Free: 100,000 requests per day and a 10 ms CPU budget per request. Check deployed requests under the real quota; a local build does not prove the app stays below CPU limits.
- D1 Free: 5 million rows read per day, 100,000 rows written per day, and 5 GB storage per account, with additional per-database limits.
- R2 Standard free allowance: 10 GB-month storage, 1 million Class A operations, and 10 million Class B operations per month. Overages are billable; alerts are not hard spending caps.
- Access Free: 50 users. Replace this small-test account setup with consumer authentication before broader acquisition or change the plan knowingly.

Sources: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [R2 activation](https://developers.cloudflare.com/r2/get-started/), [Access plans](https://www.cloudflare.com/sase/products/access/).

Authentication references: [Access on Workers hostnames and paths](https://developers.cloudflare.com/workers/configuration/cloudflare-access/), [Access policy login-method rules](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/), [signed token verification](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/), [cookie settings](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/).

## Updates and recovery

Push normal commits to `main`; GitHub Actions checks the app. Run `npm run deploy` from a trusted machine with Cloudflare access after checks pass. Cloudflare runtime secrets stay outside GitHub. Automatic deployments are not enabled by this workflow.

Keep migrations append-only. Take a database backup before future destructive schema changes. A Worker rollback does not reverse a database migration or restore deleted photos.
