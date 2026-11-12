export async function api<T = { ok?: boolean; isDemo?: boolean }>(path: string, body?: unknown, method = "POST"): Promise<T> {
  const options: RequestInit = { method, credentials: "same-origin" };
  if (body instanceof FormData) options.body = body;
  else if (body !== undefined) { options.headers = { "Content-Type": "application/json" }; options.body = JSON.stringify(body); }
  const response = await fetch(path, options);
  let data: unknown; try { data = await response.json(); } catch { throw new Error("We couldn't complete that request. Please try again."); }
  if (!response.ok) { const error = data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "Please try again."; throw new Error(error); }
  return data as T;
}
export const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
