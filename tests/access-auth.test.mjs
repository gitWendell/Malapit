import assert from "node:assert/strict";
import test from "node:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { authenticateRequest, AuthConfigurationError, safeReturnPath } from "../lib/access-auth.ts";
import { currentIdentity, runWithIdentity } from "../lib/auth-context.ts";

const config = { AUTH_MODE: "access", ACCESS_TEAM_DOMAIN: "https://malapit-test.cloudflareaccess.com", ACCESS_AUD: "test-app-audience", ADMIN_EMAILS: "owner@example.com" };
const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = { ...await exportJWK(publicKey), kid: "test-key", alg: "RS256", use: "sig" };
const keys = createLocalJWKSet({ keys: [jwk] });
async function token(claims = {}, options = {}) {
  return new SignJWT({ email: "renter@example.com", type: "app", ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setSubject("user-123").setIssuer(options.issuer ?? config.ACCESS_TEAM_DOMAIN)
    .setAudience(options.audience ?? config.ACCESS_AUD)
    .setIssuedAt().setExpirationTime(options.expiry ?? "10m").sign(privateKey);
}
function request(jwt, extra = {}) {
  return new Request("https://malapit-test.example.workers.dev/api/data", { headers: { ...extra, ...(jwt ? { "cf-access-jwt-assertion": jwt } : {}) } });
}
test("production ignores forged host identity headers and unsigned identity cookies", async () => {
  assert.equal(await authenticateRequest(request(null, { "oai-authenticated-user-id": "admin", "oai-authenticated-user-email": "owner@example.com", cookie: "__malapit_local_auth=1" }), config, keys), null);
});
test("Access signature, issuer, audience, expiry, and user claims are required", async () => {
  const valid = await token();
  assert.equal((await authenticateRequest(request(valid), config, keys)).userId, "access:user-123");
  for (const bad of ["not-a-jwt", await token({}, { audience: "another-app" }), await token({}, { issuer: "https://untrusted.cloudflareaccess.com" }), await token({}, { expiry: "-1s" }), await token({ email: undefined }), await token({ type: "service" })]) {
    assert.equal(await authenticateRequest(request(bad), config, keys), null);
  }
  const other = await generateKeyPair("RS256");
  const forged = await new SignJWT({ email: "owner@example.com", type: "app" }).setProtectedHeader({ alg: "RS256", kid: "test-key" }).setSubject("user-123").setIssuer(config.ACCESS_TEAM_DOMAIN).setAudience(config.ACCESS_AUD).setIssuedAt().setExpirationTime("10m").sign(other.privateKey);
  assert.equal(await authenticateRequest(request(forged), config, keys), null);
});
test("only a configured, verified email receives administrator rights", async () => {
  assert.equal((await authenticateRequest(request(await token()), config, keys)).isAdmin, false);
  assert.equal((await authenticateRequest(request(await token({ email: "OWNER@example.com" })), config, keys)).isAdmin, true);
  assert.equal((await authenticateRequest(request(await token({ email: "owner@example.com" })), { ...config, ADMIN_EMAILS: "" }, keys)).isAdmin, false);
});
test("missing settings and untrusted key URLs fail closed", async () => {
  for (const bad of [{}, { ...config, AUTH_MODE: "sites" }, { ...config, ACCESS_AUD: "" }, { ...config, ACCESS_TEAM_DOMAIN: "http://localhost" }, { ...config, ACCESS_TEAM_DOMAIN: "https://malapit-test.cloudflareaccess.com.evil.test" }]) {
    await assert.rejects(authenticateRequest(request("untrusted-token"), bad, keys), AuthConfigurationError);
  }
});
test("public browsing needs no account, while a signed cookie identifies the same user", async () => {
  assert.equal(await authenticateRequest(request(null), { AUTH_MODE: "access" }, keys), null);
  const jwt = await token();
  assert.equal((await authenticateRequest(request(null, { cookie: `CF_Authorization=${jwt}` }), config, keys)).userId, "access:user-123");
  assert.equal(await authenticateRequest(request(null, { cookie: "CF_Authorization=made-up" }), config, keys), null);
  assert.equal(await authenticateRequest(request(null, { cookie: `CF_Authorization=${jwt}; CF_Authorization=another` }), config, keys), null);
});
test("local fixtures work only on loopback HTTP with explicit local mode", async () => {
  const local = { AUTH_MODE: "local", ADMIN_EMAILS: "local_seedy@sites.test" };
  const fixture = new Request("http://127.0.0.1:5188/api/data", { headers: { "oai-authenticated-user-id": "local_seedy", "oai-authenticated-user-email": "local_seedy@sites.test" } });
  assert.equal((await authenticateRequest(fixture, local)).isAdmin, true);
  assert.equal(await authenticateRequest(new Request("http://localhost:5188/api/data"), local), null);
  for (const url of ["https://malapit-test.example.workers.dev/", "http://public.example/", "https://localhost/"]) await assert.rejects(authenticateRequest(new Request(url), local), AuthConfigurationError);
});
test("simultaneous requests cannot read each other's identity", async () => {
  const a = { userId: "a" }, b = { userId: "b" };
  await Promise.all([a,b].map(user => runWithIdentity(user, async () => {
    await new Promise(resolve => setTimeout(resolve, 1));
    assert.equal(currentIdentity(), user);
  })));
  assert.equal(currentIdentity(), null);
});
test("sign-in returns only to safe app paths", () => {
  assert.equal(safeReturnPath("/?view=saved"), "/?view=saved");
  for (const value of [null, "//evil.test", "/\\evil.test", "https://evil.test", "/auth/signout", "/cdn-cgi/access/logout"]) assert.equal(safeReturnPath(value), "/");
});
