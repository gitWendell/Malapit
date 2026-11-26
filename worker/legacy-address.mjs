const PUBLIC_ORIGIN = "https://malapit.malapit-ph.workers.dev";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const read = request.method === "GET" || request.method === "HEAD";
    const publicPage = url.pathname === "/" || ["/guide", "/privacy", "/terms", "/install", "/payment-demo"].includes(url.pathname.replace(/\/$/, ""));
    // Start new sign-ins on the public origin. Existing callbacks must keep
    // their original host so the browser's PKCE verifier cookie still matches.
    if (read && (publicPage || url.pathname === "/auth/signin")) {
      const destination = new URL(url.pathname + url.search, PUBLIC_ORIGIN);
      return new Response(null, { status: 307, headers: {
        Location: destination.href,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      } });
    }
    // Preserve the URL, cookies, method and body for already-open tabs and
    // in-flight callbacks. The main app performs all normal access checks.
    return env.MALAPIT.fetch(request);
  },
};
