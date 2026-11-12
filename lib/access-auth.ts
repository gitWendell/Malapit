import { createRemoteJWKSet, jwtVerify } from "jose";

export type AuthIdentity = {
  userId: string;
  displayName: string;
  email: string;
  isAdmin: boolean;
};

export type AuthConfig = {
  AUTH_MODE?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ADMIN_EMAILS?: string;
};

type KeyResolver = ReturnType<typeof createRemoteJWKSet>;
const keySets = new Map<string, KeyResolver>();
const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

export class AuthConfigurationError extends Error {}

export function isLocalAuth(request: Request, config: AuthConfig): boolean {
  const url = new URL(request.url);
  return config.AUTH_MODE === "local" && url.protocol === "http:" && loopbackHosts.has(url.hostname);
}

function withRole(userId: string, email: string, displayName: string, config: AuthConfig): AuthIdentity {
  const admins = (config.ADMIN_EMAILS ?? "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  return { userId, email, displayName, isAdmin: admins.includes(email.toLowerCase()) };
}

// The optional key resolver is for deterministic unit tests, never request input.
export async function authenticateRequest(request: Request, config: AuthConfig, testKeys?: KeyResolver): Promise<AuthIdentity | null> {
  if (config.AUTH_MODE === "local") {
    if (!isLocalAuth(request, config)) throw new AuthConfigurationError("Local authentication is restricted to loopback HTTP.");
    const id = request.headers.get("oai-authenticated-user-id");
    const email = request.headers.get("oai-authenticated-user-email");
    if (id && email) return withRole(id, email, email.split("@")[0], config);
    if ((request.headers.get("cookie") ?? "").split(";").some(value => value.trim() === "__malapit_local_auth=1")) {
      return withRole("local_seedy", "local_seedy@sites.test", "Seedy", config);
    }
    return null;
  }

  if (config.AUTH_MODE !== "access") throw new AuthConfigurationError("Choose a supported authentication mode.");
  // Only /auth/signin is behind Access. Public browsing and APIs receive the
  // signed application cookie rather than an edge-injected assertion header.
  const cookies = (request.headers.get("cookie") ?? "").split(";").map(value => value.trim()).filter(value => value.startsWith("CF_Authorization="));
  const token = request.headers.get("cf-access-jwt-assertion") ?? (cookies.length === 1 ? cookies[0].slice("CF_Authorization=".length) : null);
  if (!token) return null;
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(config.ACCESS_TEAM_DOMAIN ?? "") || !config.ACCESS_AUD?.trim()) {
    throw new AuthConfigurationError("Cloudflare Access is not configured.");
  }
  const issuer = config.ACCESS_TEAM_DOMAIN!;
  let keys = testKeys ?? keySets.get(issuer);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    keySets.set(issuer, keys);
  }
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer, audience: config.ACCESS_AUD, algorithms: ["RS256"],
      requiredClaims: ["sub", "email", "exp", "iat", "type"],
    });
    // Service tokens do not represent a renter or owner account.
    if (payload.type !== "app" || typeof payload.sub !== "string" || !payload.sub || typeof payload.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) return null;
    const name = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : payload.email.split("@")[0];
    return withRole(`access:${payload.sub}`, payload.email, name, config);
  } catch {
    return null;
  }
}

export function safeReturnPath(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "https://malapit.invalid");
    if (url.origin !== "https://malapit.invalid" || /^\/(auth|cdn-cgi)(\/|$)/.test(url.pathname)) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return "/"; }
}
