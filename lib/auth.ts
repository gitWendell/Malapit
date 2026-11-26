import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import { signInConfigured, supabaseOrigin, type SupabaseConfig } from "./supabase-config.ts";
import { localTestAccount } from "./local-test-accounts.ts";
import { safeReturnPath } from "./auth-return.ts";
export { safeReturnPath } from "./auth-return.ts";

export type AuthIdentity = { userId: string; displayName: string; email: string; isAdmin: boolean };
export type AuthConfig = SupabaseConfig;
const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

export class AuthConfigurationError extends Error {}

export function isLocalAuth(request: Request, config: AuthConfig): boolean {
  const url = new URL(request.url);
  return config.AUTH_MODE === "local" && url.protocol === "http:" && loopbackHosts.has(url.hostname);
}

function withRole(userId: string, email: string, displayName: string, config: AuthConfig): AuthIdentity {
  const admins = (config.ADMIN_USER_IDS ?? "").split(",").map(value => value.trim()).filter(Boolean);
  return { userId, email, displayName, isAdmin: admins.includes(userId) };
}

export function createRequestAuth(request: Request, config: AuthConfig, fetcher: typeof fetch = fetch) {
  if (config.AUTH_MODE === "local" && !isLocalAuth(request, config)) throw new AuthConfigurationError("Local sign-in requires loopback HTTP.");
  if (config.AUTH_MODE !== "local" && config.AUTH_MODE !== "supabase") throw new AuthConfigurationError("Choose a supported sign-in mode.");
  const local = isLocalAuth(request, config);
  const ready = local || signInConfigured(config);
  const pendingCookies = new Map<string, string>();
  const client = !local && ready ? createServerClient(supabaseOrigin(config)!, config.SUPABASE_PUBLISHABLE_KEY!, {
    cookieOptions: { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
    global: { fetch: (input, init) => fetcher(input, { ...init, signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(15_000)]) }) },
    cookies: {
      getAll: () => parseCookieHeader(request.headers.get("cookie") ?? ""),
      setAll: cookies => {
        for (const { name, value, options } of cookies) pendingCookies.set(name, serializeCookieHeader(name, value, { ...options, httpOnly: true, secure: true, sameSite: "lax", path: "/", domain: undefined }));
      },
    },
  }) : null;

  return {
    ready,
    local,
    async identity(verifyWithAuthServer = false): Promise<AuthIdentity | null> {
      if (local) {
        const id = request.headers.get("oai-authenticated-user-id"), email = request.headers.get("oai-authenticated-user-email");
        if (id && email) return withRole(id, email, email.split("@")[0], config);
        const account = localTestAccount(parseCookieHeader(request.headers.get("cookie") ?? "").find(cookie => cookie.name === "__malapit_local_auth")?.value ?? "");
        if (account) return withRole(account.userId, account.email, account.displayName, config);
        return null;
      }
      if (!client) return null;
      try {
        // getClaims verifies the JWT signature and expiry; never trust the user
        // object embedded in a cookie or any client-supplied identity header.
        const { data, error } = await client.auth.getClaims();
        if (error || !data?.claims) return null;
        const claims = data.claims;
        const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
        if (claims.iss !== `${supabaseOrigin(config)}/auth/v1` || !audiences.includes("authenticated") || claims.role !== "authenticated" || claims.is_anonymous || !/^[a-f0-9-]{36}$/i.test(claims.sub) || typeof claims.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email)) return null;
        if (claims.app_metadata?.provider !== "google" && !claims.app_metadata?.providers?.includes("google")) return null;
        // Private rental invitations depend on the current verified account
        // email, not a profile field or a possibly stale email in a valid JWT.
        if (verifyWithAuthServer) {
          const { data: current, error: userError } = await client.auth.getUser();
          const user = current.user;
          if (userError || !user || user.id !== claims.sub || user.is_anonymous || !user.email_confirmed_at || typeof user.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) return null;
          if (user.app_metadata?.provider !== "google" && !(Array.isArray(user.app_metadata?.providers) && user.app_metadata.providers.includes("google"))) return null;
          const currentName = user.user_metadata?.full_name;
          return withRole(user.id, user.email, typeof currentName === "string" && currentName.trim() ? currentName.trim().slice(0, 120) : user.email.split("@")[0], config);
        }
        const name = claims.user_metadata?.full_name;
        return withRole(claims.sub, claims.email, typeof name === "string" && name.trim() ? name.trim().slice(0, 120) : claims.email.split("@")[0], config);
      } catch { return null; }
    },
    async signIn(returnTo: string): Promise<string> {
      if (!client) throw new AuthConfigurationError("Sign-in is being prepared.");
      const callback = new URL("/auth/callback", request.url);
      callback.searchParams.set("return_to", safeReturnPath(returnTo));
      const { data, error } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback.href, skipBrowserRedirect: true } });
      if (error || !data.url || new URL(data.url).origin !== supabaseOrigin(config)) throw new Error("Sign-in could not start.");
      return data.url;
    },
    async callback(code: string): Promise<boolean> {
      if (!client || !code || code.length > 4096) return false;
      try { const { error } = await client.auth.exchangeCodeForSession(code); return !error; }
      catch { return false; }
    },
    async signOut() {
      if (client) { try { await client.auth.signOut({ scope: "local" }); } catch { /* Cookie removal below still signs this browser out. */ } }
      if (!local) for (const cookie of parseCookieHeader(request.headers.get("cookie") ?? "")) {
        if (/^sb-[a-z0-9-]+-auth-token(?:\.\d+)?$/.test(cookie.name)) pendingCookies.set(cookie.name, serializeCookieHeader(cookie.name, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 }));
      }
    },
    response(response: Response): Response {
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "private, no-store");
      headers.set("Pragma", "no-cache");
      headers.set("Expires", "0");
      for (const cookie of pendingCookies.values()) headers.append("Set-Cookie", cookie);
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    },
  };
}
