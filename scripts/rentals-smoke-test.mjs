import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// Never accept a host or port override: these identity fixtures and cleanup
// queries belong only to this project's isolated loopback Worker.
const base = "http://127.0.0.1:5188", run = crypto.randomUUID().slice(0, 8);
const person = role => ({ id: "qa-rental-" + role + "-" + run, email: "qa-rental-" + role + "-" + run + "@sites.test" });
const owner = person("owner"), renter = person("renter"), other = person("other"), replacement = person("replacement"), reviewer = { id: "local_seedy", email: "local_seedy@sites.test" };
const records = [], requestId = crypto.randomUUID();
let checks = 0;
async function request(path, user, method = "GET", body, origin = base) {
  const headers = {};
  if (user) { headers["oai-authenticated-user-id"] = user.id; headers["oai-authenticated-user-email"] = user.email; }
  if (method !== "GET") headers.origin = origin;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(base + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json();
  return { status: response.status, data, headers: response.headers };
}
function expect(result, status, label) { assert.equal(result.status, status, label + ": " + JSON.stringify(result.data)); checks++; return result.data; }
function localSql(sql) { return execFileSync(process.execPath, ["--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js", "d1", "execute", "DB", "--local", "--config", "dist/server/wrangler.json", "--persist-to", ".wrangler/state", "--command", sql], { cwd: new URL("..", import.meta.url), stdio: "pipe" }); }
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const state = user => request("/api/rentals", user);
const connectionPath = id => "/api/rentals/connections/" + id;
const unitPath = id => "/api/rentals/units/" + id;
const terms = { propertyName: "QA private house " + run, unitName: "Unit 2B", city: "Makati", address: "QA private street, test location only", monthlyRentCents: 1000005, dueDay: 31, leaseStart: "2026-01-01", leaseEnd: null };
async function latestUnit(id, user = owner) { return expect(await state(user), 200, "Owner reads scoped records").units.find(unit => unit.id === id); }
async function invite(unit, email = renter.email) { return request("/api/rentals/invitations", owner, "POST", { unitId: unit.id, unitVersion: unit.updatedAt, email, sharingConfirmed: true }); }
try {
  expect(await state(null), 401, "Signed-out rental reads denied");
  expect(await request("/api/rentals/units", null, "POST", terms), 401, "Signed-out creation denied");
  expect(await request("/api/rentals/units", owner, "POST", terms, "https://untrusted.invalid"), 403, "Cross-site creation denied");
  expect(await request("/api/rentals/units", owner, "POST", { ...terms, monthlyRentCents: 10.1 }), 400, "Fractional cents rejected");
  expect(await request("/api/rentals/units", owner, "POST", { ...terms, leaseStart: "2026-02-30" }), 400, "Impossible date rejected");
  const created = expect(await request("/api/rentals/units", owner, "POST", { ...terms, requestId, ownerId: other.id }), 201, "Private unit persisted");
  records.push(created.id);
  const repeated = expect(await request("/api/rentals/units", owner, "POST", { ...terms, requestId }), 201, "Creation retry is idempotent"); assert.equal(repeated.id, created.id); checks++;
  let unit = await latestUnit(created.id); assert.equal(unit.ownerId, owner.id); assert.equal(unit.monthlyRentCents, 1000005); checks++;
  assert.equal(expect(await state(other), 200, "Other user gets own scope").units.length, 0); checks++;
  const reviewState = expect(await state(reviewer), 200, "Reviewer gets own scope"); assert(!reviewState.units.some(u => u.id === unit.id)); checks++;
  const publicState = expect(await request("/api/data", null), 200, "Public map still loads"); assert(!JSON.stringify(publicState).includes(run)); checks++;
  expect(await request(unitPath(unit.id), other, "PATCH", { action: "archive", version: unit.updatedAt }), 404, "Other owner cannot archive");
  expect(await request(unitPath(unit.id), owner, "PATCH", { action: "update", version: "stale", data: terms }), 409, "Stale changes rejected");
  expect(await request("/api/rentals/invitations", owner, "POST", { unitId: unit.id, unitVersion: unit.updatedAt, email: renter.email, sharingConfirmed: false }), 400, "Explicit sharing required");
  expect(await invite(unit, owner.email), 400, "Self invitation rejected");
  const invitation = expect(await invite(unit, "  " + renter.email.toUpperCase() + "  "), 201, "Invitation created");
  const path = connectionPath(invitation.id);
  assert.equal(expect(await state(renter), 200, "Renter receives matching invitation").myConnections.find(c => c.id === invitation.id).inviteEmail, renter.email); checks++;
  expect(await request(path, null), 401, "Anonymous invitation detail denied");
  expect(await request(path, other), 404, "Link is insufficient for another account");
  expect(await request(path, reviewer), 404, "Listing reviewer cannot inspect private rental");
  expect(await request(path, other, "PATCH", { action: "accept", detailsConfirmed: true }), 404, "Wrong renter cannot accept");
  expect(await request(path, owner, "PATCH", { action: "accept", detailsConfirmed: true }), 403, "Owner cannot impersonate renter");
  expect(await request(path, renter, "PATCH", { action: "accept", detailsConfirmed: false }), 400, "Renter must confirm details");
  expect(await invite(unit), 409, "Second pending invitation rejected");
  expect(await request(unitPath(unit.id), owner, "PATCH", { action: "update", version: unit.updatedAt, data: { ...terms, monthlyRentCents: 1200000 } }), 409, "Pending terms cannot be silently changed");
  const race = await Promise.all([request(path, renter, "PATCH", { action: "accept", detailsConfirmed: true }), request(path, renter, "PATCH", { action: "accept", detailsConfirmed: true })]);
  for (const result of race) expect(result, 200, "Repeated acceptance is safe");
  const detail = expect(await request(path, renter), 200, "Accepted renter reads record");
  assert.equal(detail.connection.status, "accepted"); assert.equal(detail.connection.monthlyRentCents, terms.monthlyRentCents); assert.equal(detail.events.filter(event => event.action === "accepted").length, 1); checks++;
  assert.match(detail.headers?.get?.("cache-control") || (await request(path, renter)).headers.get("cache-control"), /no-store/); checks++;
  expect(await request(path, { ...renter, email: "changed-" + renter.email }), 200, "Existing connection follows verified user ID");
  expect(await request(path, { ...other, email: renter.email }), 404, "Old email cannot reveal an accepted record to a different ID");
  expect(await request(unitPath(unit.id), owner, "PATCH", { action: "archive", version: unit.updatedAt }), 409, "Connected unit cannot be archived");
  expect(await request(path, owner, "PATCH", { action: "revoke", confirmed: true }), 409, "Accepted connection cannot be revoked as a pending invite");
  expect(await request(path, other, "PATCH", { action: "end", confirmed: true }), 404, "Other user cannot close record");
  expect(await request(path, renter, "PATCH", { action: "end", confirmed: true }), 200, "Renter can close their app connection");
  expect(await request(path, renter, "PATCH", { action: "end", confirmed: true }), 200, "Closing retry is idempotent");
  const closed = expect(await request(path, owner), 200, "Owner keeps original record"); assert.equal(closed.connection.status, "ended"); assert.equal(closed.events.filter(event => event.action === "ended").length, 1); checks++;
  expect(await request(unitPath(unit.id), owner, "PATCH", { action: "update", version: unit.updatedAt, data: { ...terms, monthlyRentCents: 1200000 } }), 200, "Owner prepares new terms after closing");
  const oldSnapshot = expect(await request(path, renter), 200, "Original renter retains their own history"); assert.equal(oldSnapshot.connection.monthlyRentCents, terms.monthlyRentCents); checks++;
  unit = await latestUnit(unit.id); const next = expect(await invite(unit, replacement.email), 201, "New renter receives a new connection");
  expect(await request(connectionPath(next.id), replacement, "PATCH", { action: "accept", detailsConfirmed: true }), 200, "Replacement renter accepts their own record");
  expect(await request(path, replacement), 404, "New renter cannot read prior renter history");
  const replacementData = expect(await state(replacement), 200, "Replacement scope loads"); assert(!replacementData.myConnections.some(c => c.id === invitation.id)); checks++;
  expect(await request(connectionPath(next.id), owner, "PATCH", { action: "end", confirmed: true }), 200, "Owner closes current connection");
  unit = await latestUnit(unit.id);
  const declined = expect(await invite(unit), 201, "Another invitation can be prepared");
  expect(await request(connectionPath(declined.id), renter, "PATCH", { action: "decline", confirmed: true }), 200, "Invited renter can decline");
  const revoked = expect(await invite(unit), 201, "Decline releases the unit");
  expect(await request(connectionPath(revoked.id), owner, "PATCH", { action: "revoke", confirmed: true }), 200, "Owner revokes a pending invitation");
  expect(await request(connectionPath(revoked.id), renter), 404, "Revoked link no longer reveals private details");
  expect(await request(unitPath(unit.id), owner, "PATCH", { action: "archive", version: unit.updatedAt }), 200, "Unused unit archived");
  unit = await latestUnit(unit.id); expect(await invite(unit), 409, "Archived units cannot receive invitations");
  expect(await request(unitPath(unit.id), owner, "PATCH", { action: "restore", version: unit.updatedAt }), 200, "Archived unit restored");
  unit = await latestUnit(unit.id);
  const competing = await Promise.all([invite(unit), invite(unit, replacement.email)]);
  assert.deepEqual(competing.map(result => result.status).sort(), [201, 409]); checks++;
  const winner = competing.find(result => result.status === 201).data.id;
  expect(await request(connectionPath(winner), owner, "PATCH", { action: "revoke", confirmed: true }), 200, "Competing test invitation revoked");
  // Seed one expired fixture directly into this local database; production
  // cannot edit an invitation's immutable expiry.
  const expired = crypto.randomUUID(), expiredAt = new Date(Date.now() - 1000).toISOString(), now = new Date().toISOString();
  localSql("INSERT INTO rental_connections (id,unit_id,owner_id,owner_name,owner_email,invite_email,status,property_name,unit_name,city,address,monthly_rent_cents,due_day,lease_start,lease_end,created_at,created_day,expires_at) SELECT " + quote(expired) + ",id,owner_id,'QA Owner'," + quote(owner.email) + "," + quote(renter.email) + ",'pending',property_name,unit_name,city,address,monthly_rent_cents,due_day,lease_start,lease_end," + quote(now) + ",'expiry-fixture'," + quote(expiredAt) + " FROM rental_units WHERE id=" + quote(unit.id) + ";");
  expect(await request(connectionPath(expired), renter), 404, "Expired invitation no longer exposes details");
  const renewed = expect(await invite(unit), 201, "New invitation records prior expiry atomically");
  assert.equal(expect(await request(connectionPath(expired), owner), 200, "Owner sees expired history").connection.status, "expired"); checks++;
  expect(await request(connectionPath(renewed.id), owner, "PATCH", { action: "revoke", confirmed: true }), 200, "Renewed fixture revoked");
  console.log("PASS: " + checks + " private-rental checks covering accounts, ownership, invitations, races, immutable terms, expiry and history.");
} finally {
  for (const user of [owner, renter, other, replacement]) assert.match(user.id, /^qa-rental-(owner|renter|other|replacement)-[a-f0-9]{8}$/);
  localSql("DELETE FROM rental_events WHERE connection_id IN (SELECT id FROM rental_connections WHERE owner_id=" + quote(owner.id) + "); DELETE FROM rental_connections WHERE owner_id=" + quote(owner.id) + "; DELETE FROM rental_units WHERE owner_id=" + quote(owner.id) + ";");
  console.log("Removed this run's isolated local private-rental records.");
}
