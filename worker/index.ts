import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import { createRequestAuth, safeReturnPath } from "../lib/auth";
import { runWithIdentity } from "../lib/auth-context";

const worker = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    const url = new URL(request.url);
    let auth;
    try { auth = createRequestAuth(request, env); }
    catch {
      return new Response("Malapit testing is being set up. Please try again later.", { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    if (url.pathname === "/auth/callback") {
      const ok = request.method === "GET" && !url.searchParams.has("error") && await auth.callback(url.searchParams.get("code") ?? "");
      return auth.response(new Response(null, { status: 302, headers: { Location: ok ? safeReturnPath(url.searchParams.get("return_to")) : "/?auth=failed", "Referrer-Policy": "no-referrer" } }));
    }
    if (url.pathname === "/auth/signin" || url.pathname === "/auth/signout") {
      if (request.method !== "GET") return new Response(null, { status: 405, headers: { Allow: "GET" } });
      const origin = request.headers.get("origin");
      if ((origin && origin !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site") return new Response(null, { status: 403 });
      const signOut = url.pathname === "/auth/signout";
      if (!auth.local && !signOut && !auth.ready) return auth.response(new Response("Sign-in is being prepared. Please try again later.", { status: 503 }));
      let location = safeReturnPath(url.searchParams.get("return_to"));
      if (signOut) await auth.signOut();
      else if (!auth.local) {
        try { location = await auth.signIn(location); }
        catch { return auth.response(new Response(null, { status: 302, headers: { Location: "/?auth=failed" } })); }
      }
      return auth.response(new Response(null, { status: 302, headers: {
        Location: location,
        "Cache-Control": "private, no-store",
        ...(auth.local ? { "Set-Cookie": `__malapit_local_auth=${signOut ? "" : "1"}; Path=/; HttpOnly; SameSite=Lax${signOut ? "; Max-Age=0" : ""}` } : {}),
      } }));
    }
    const user = await auth.identity();
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
    return auth.response(response);
  },
};

export default worker;
