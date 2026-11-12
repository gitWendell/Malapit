import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import { authenticateRequest, isLocalAuth, safeReturnPath } from "../lib/access-auth";
import { runWithIdentity } from "../lib/auth-context";

const worker = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    const url = new URL(request.url);
    let user;
    try { user = await authenticateRequest(request, env); }
    catch {
      // Missing provider settings never grant a user or admin role. Browsing can
      // remain public while the account connection is being configured.
      if (env.AUTH_MODE === "access") user = null;
      else return new Response("Malapit testing is being set up. Please try again later.", { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    if (url.pathname === "/auth/signin" || url.pathname === "/auth/signout") {
      if (request.method !== "GET") return new Response(null, { status: 405, headers: { Allow: "GET" } });
      const origin = request.headers.get("origin");
      if ((origin && origin !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site") return new Response(null, { status: 403 });
      const signOut = url.pathname === "/auth/signout";
      const local = isLocalAuth(request, env);
      if (!local && !signOut && !user) return new Response("Sign-in is still being connected. Please try again later.", { status: 503, headers: { "Cache-Control": "no-store" } });
      return new Response(null, { status: 302, headers: {
        Location: local || !signOut ? safeReturnPath(url.searchParams.get("return_to")) : "/cdn-cgi/access/logout",
        "Cache-Control": "private, no-store",
        ...(local ? { "Set-Cookie": `__malapit_local_auth=${signOut ? "" : "1"}; Path=/; HttpOnly; SameSite=Lax${signOut ? "; Max-Age=0" : ""}` } : {}),
        ...(!local && signOut ? { "Set-Cookie": "CF_Authorization=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0" } : {}),
      } });
    }
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    const response = await runWithIdentity(user, () => runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx)));
    // Authenticated HTML and API data must never enter shared HTTP caches.
    if (url.pathname === "/" || url.pathname.startsWith("/api/")) {
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "private, no-store");
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }
    return response;
  },
};

export default worker;
