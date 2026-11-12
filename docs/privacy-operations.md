# Privacy requests during the pilot

The public notice identifies Casul Wendell and the approved support email. Requests are handled manually; the app does not offer automatic account or message deletion. Keep the notice consistent with the actual service before changing its uses or recipients.

## Handling a request

1. Confirm the requester controls the relevant account. Prefer a reply from their account email; avoid collecting identity documents unless a specific need and secure transfer method are established.
2. Identify the relevant account UUID, listings, photo IDs, saved homes, inquiries and reports. Restrict any export to that person's information; do not disclose another user's private data without a valid basis.
3. Assess the request and explain any specific legal or unresolved-dispute reason that requires limited retention. Set a case-specific completion date with the requester. Do not treat a hidden or withdrawn listing as erased.
4. For an approved erasure, hide affected listings first. Remove eligible Storage objects through the Supabase Storage service; never delete `storage.objects` database rows directly. Confirm object deletion before releasing D1 photo reservations. Inspect listing references before removing a shared reference.
5. Remove or de-identify the eligible D1 records in an isolated, reviewed operation. Account deletion in Supabase Auth is a separate step and does not remove Cloudflare records or stored photos automatically.
6. Confirm the outcome and explain any retained information and provider backup/log limits. Keep only the minimum case record needed to document the request.

## Retention review

Review retained records when a user makes a request and when closing the pilot. Remove or de-identify records no longer needed for the stated account, rental, conversation, report or dispute purpose. The current app has no scheduled retention job. Before scaling the pilot, choose fixed review intervals and implement a repeatable cleanup process.

Provider logs and backups have separate retention arrangements. Check current account settings and official provider documentation before promising deletion dates. Do not promise that withdrawing a listing deletes its photos or messages.

References: [NPC right to be informed](https://privacy.gov.ph/the-right-to-be-informed/), [NPC data subject rights](https://privacy.gov.ph/data-subject-rights/), [Google OAuth branding requirements](https://support.google.com/cloud/answer/15549049?hl=en).
