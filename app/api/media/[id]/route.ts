import { env } from "cloudflare:workers";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params; if (!/^[a-f0-9-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const object = await env.BUCKET?.get(id); if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType || "image/jpeg", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" } });
}
