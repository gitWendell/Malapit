import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

// Deliberately restricted to this project's built local Worker. Never use identity
// test headers or cleanup SQL against a deployed Site.
const base = "http://127.0.0.1:5188";
assert.equal(new URL(base).hostname, "127.0.0.1");
const run = crypto.randomUUID().slice(0, 8);
const admin = { id: "local_seedy", name: "Seedy" };
const owner = { id: `qa-owner-${run}`, name: "QA Property Owner" };
const renter = { id: `qa-renter-${run}`, name: "QA Renter" };
const outsider = { id: `qa-other-${run}`, name: "QA Other Owner" };
const mediaIds = [];
let listingId, checks = 0;
async function request(path, user, method = "GET", body, origin = base) {
  const headers = {};
  if (user) {
    headers["oai-authenticated-user-id"] = user.id;
    headers["oai-authenticated-user-email"] = `${user.id}@sites.test`;
    headers["oai-authenticated-user-full-name"] = encodeURIComponent(user.name);
    headers["oai-authenticated-user-full-name-encoding"] = "percent-encoded-utf-8";
  }
  if (method !== "GET") headers.Origin = origin;
  if (body && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
  const res = await fetch(base + path, { method, headers, ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) });
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) }; }
  return { status: res.status, data };
}
function localSql(sql) {
  execFileSync(process.execPath, ["--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js", "d1", "execute", "DB", "--local", "--config", "dist/server/wrangler.json", "--persist-to", ".wrangler/state", "--command", sql], { cwd: new URL("..", import.meta.url), stdio: "pipe" });
}
function expect(result, status, label) { assert.equal(result.status, status, `${label}: ${JSON.stringify(result.data)}`); checks++; }
try {
  expect(await request("/api/saved", null, "POST", { listingId: "demo-1", saved: true }), 401, "Anonymous writes rejected");
  expect(await request("/api/saved", renter, "POST", { listingId: "demo-1", saved: true }, "https://untrusted.invalid"), 403, "Cross-origin writes rejected");
  const adminState = await request("/api/data", admin); expect(adminState, 200, "Administrator session"); assert.equal(adminState.data.session.isAdmin, true);
  expect(await request("/api/listings", owner, "POST", {}), 400, "Incomplete listing rejected");
  const badPhoto = new FormData(); badPhoto.set("file", new Blob(["not an image"], { type: "image/jpeg" }), "fake.jpg");
  expect(await request("/api/media", owner, "POST", badPhoto), 400, "Disguised image rejected");
  const upload = new FormData(); upload.set("file", new Blob([await readFile(new URL("../public/homes/home-1.jpg", import.meta.url))], { type: "image/jpeg" }), "qa-home.jpg");
  const photo = await request("/api/media", owner, "POST", upload); expect(photo, 201, "Photo upload persisted"); mediaIds.push(photo.data.url.split("/").at(-1));
  const input = { title: "QA lifecycle test apartment", city: "Makati", neighborhood: "Test neighborhood", address: "Private test building, private street, Makati", lat: 14.554321, lng: 121.024678, type: "Apartment", price: 12000, priceBasis: "entire unit", bedrooms: 1, bathrooms: 1, area: 28, description: "A fictional property created only for the local authorization and listing lifecycle smoke test.", photos: [photo.data.url], amenities: ["Own meter", "Kitchen"], deposit: 24000, advance: 12000, monthlyFees: 0, utilities: "Separate utility bills, test data only.", minLease: 6, availableFrom: "2026-12-01", role: "Direct owner", exactLocation: false, authorityConfirmed: true };
  const created = await request("/api/listings", owner, "POST", input); expect(created, 201, "Owner submission saved"); listingId = created.data.id;
  const pending = await request("/api/data", owner); assert(pending.data.myListings.some(p => p.id === listingId && p.status === "pending")); assert(!pending.data.listings.some(p => p.id === listingId)); checks++;
  expect(await request(`/api/listings/${listingId}`, outsider, "PATCH", { action: "confirm" }), 403, "Other owners cannot modify listings");
  expect(await request(`/api/listings/${listingId}`, owner, "PATCH", { action: "approve" }), 403, "Owners cannot approve themselves");
  expect(await request(`/api/listings/${listingId}`, owner, "PATCH", { action: "confirm" }), 409, "Pending listings cannot be confirmed into search");
  expect(await request(`/api/listings/${listingId}`, admin, "PATCH", { action: "approve" }), 200, "Admin approval succeeds");
  const publicData = await request("/api/data", null); const visible = publicData.data.listings.find(p => p.id === listingId); assert(visible); assert(!visible.address.includes("Private")); assert.notEqual(visible.lat, input.lat); assert.notEqual(visible.lng, input.lng); checks++;
  const privateData = await request("/api/data", owner); assert.equal(privateData.data.myListings.find(p => p.id === listingId).address, input.address); checks++;
  expect(await request("/api/saved", renter, "POST", { listingId, saved: true }), 200, "Saving a property succeeds");
  assert((await request("/api/data", renter)).data.savedIds.includes(listingId)); assert(!(await request("/api/data", outsider)).data.savedIds.includes(listingId)); checks++;
  const inquiry = { listingId, message: "QA inquiry. Is a viewing available next week?", moveIn: "2026-12-01", occupants: 2 };
  const staleDate = new Date(Date.now() - 15 * 86400000).toISOString();
  assert.match(listingId, /^[a-f0-9-]{36}$/);
  localSql(`UPDATE listings SET confirmed_at = '${staleDate}' WHERE id = '${listingId}';`);
  assert(!(await request("/api/data", renter)).data.listings.some(p => p.id === listingId)); checks++;
  const staleOwn = (await request("/api/data", owner)).data.myListings.find(p => p.id === listingId);
  assert.equal(staleOwn.confirmedAt, staleDate); assert.equal(staleOwn.status, "published"); checks++;
  expect(await request("/api/inquiries", renter, "POST", inquiry), 404, "Expired confirmations block new inquiries");
  expect(await request(`/api/listings/${listingId}`, outsider, "PATCH", { action: "confirm" }), 403, "Other owners cannot revive an expired listing");
  expect(await request(`/api/listings/${listingId}`, owner, "PATCH", { action: "confirm" }), 200, "Owner reconfirmation restores visibility");
  const renewed = (await request("/api/data", renter)).data.listings.find(p => p.id === listingId);
  assert(renewed); assert(Date.parse(renewed.confirmedAt) > Date.now() - 60000); assert.equal(renewed.status, "published"); checks++;
  expect(await request("/api/inquiries", owner, "POST", inquiry), 400, "Self-inquiries rejected");
  expect(await request("/api/inquiries", renter, "POST", inquiry), 201, "Renter inquiry persisted");
  const ownerInbox = (await request("/api/data", owner)).data.inquiries.find(p => p.listingId === listingId); assert(ownerInbox); assert(!(await request("/api/data", outsider)).data.inquiries.some(p => p.listingId === listingId)); checks++;
  expect(await request("/api/inquiries", renter, "PATCH", { id: ownerInbox.id, reply: "Impersonating an owner reply" }), 403, "Renters cannot impersonate owner replies");
  expect(await request("/api/inquiries", owner, "PATCH", { id: ownerInbox.id, reply: "QA owner reply: a viewing can be arranged." }), 200, "Owner reply persisted");
  assert((await request("/api/data", renter)).data.inquiries.find(p => p.id === ownerInbox.id).reply.includes("viewing")); checks++;
  expect(await request("/api/reports", renter, "POST", { listingId, reason: "QA test report about inaccurate details." }), 201, "Listing report saved");
  const flag = (await request("/api/data", admin)).data.reports.find(p => p.listingId === listingId); assert(flag);
  expect(await request("/api/reports", renter, "PATCH", { id: flag.id }), 403, "Only admin can resolve reports");
  expect(await request("/api/reports", admin, "PATCH", { id: flag.id }), 200, "Admin report resolution saved");
  expect(await request(`/api/listings/${listingId}`, owner, "PATCH", { action: "pause" }), 200, "Owner can pause listing");
  assert(!(await request("/api/data", null)).data.listings.some(p => p.id === listingId)); checks++;
  expect(await request("/api/inquiries", renter, "POST", inquiry), 404, "Paused listings cannot receive new inquiries");
  expect(await request(`/api/listings/${listingId}`, owner, "PATCH", { action: "confirm" }), 409, "Confirmation cannot reactivate a paused listing");
  expect(await request(`/api/listings/${listingId}`, owner, "PATCH", { action: "resubmit" }), 200, "Owner can resubmit");
  expect(await request(`/api/listings/${listingId}`, admin, "PATCH", { action: "reject", reason: "QA review: please clarify the address." }), 200, "Reviewer can request changes");
  expect(await request(`/api/listings/${listingId}`, owner, "PATCH", { action: "update", data: { ...input, title: "QA corrected test apartment" } }), 200, "Edit returns listing to review");
  expect(await request(`/api/listings/${listingId}`, admin, "PATCH", { action: "approve" }), 200, "Corrected listing can be approved");
  expect(await request(`/api/listings/${listingId}`, owner, "PATCH", { action: "rent" }), 200, "Owner can mark rented");
  assert(!(await request("/api/data", null)).data.listings.some(p => p.id === listingId)); checks++;
  expect(await request(`/api/listings/${listingId}`, owner, "PATCH", { action: "confirm" }), 409, "Confirmation cannot reactivate a rented listing");
  console.log(`PASS: ${checks} checks covering authentication, authorization, upload validation, listing review, location privacy, saves, inquiries, replies, reports, availability expiry, owner reconfirmation, and listing state changes.`);
} finally {
  const sql = [];
  if (listingId && /^[a-f0-9-]{36}$/.test(listingId)) for (const table of ["inquiries", "saved_homes", "reports"]) sql.push(`DELETE FROM ${table} WHERE listing_id = '${listingId}'`);
  if (listingId && /^[a-f0-9-]{36}$/.test(listingId)) sql.push(`DELETE FROM listings WHERE id = '${listingId}'`);
  for (const id of mediaIds) if (/^[a-f0-9-]{36}$/.test(id)) sql.push(`DELETE FROM media WHERE id = '${id}'`);
  if (sql.length) { execFileSync(process.execPath, ["--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js", "d1", "execute", "DB", "--local", "--config", "dist/server/wrangler.json", "--persist-to", ".wrangler/state", "--command", sql.join("; ") + ";"], { cwd: new URL("..", import.meta.url), stdio: "pipe" }); console.log("Removed this run's temporary local database records."); }
}
