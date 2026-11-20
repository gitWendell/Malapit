// Server-only caller. Credentials are supplied by the Worker, never the browser.
import { HITPAY_SANDBOX_API } from "./hitpay-sandbox.ts";
export class ProviderFailure extends Error {
  rejected: boolean;
  status?: number;
  constructor(rejected: boolean, status?: number) {
    super("HitPay sandbox could not complete this request.");
    this.rejected = rejected;
    this.status = status;
  }
}
export async function callSandboxProvider(
  key: string,
  path: string,
  body?: unknown,
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  if (!/^\/v1\/(webhook-events|payment-requests(?:\/[a-f0-9-]{36})?)(?:\?search=[A-Za-z0-9-]{1,100}&per_page=2&current_page=1)?$/i.test(path)) {
    throw new ProviderFailure(false);
  }
  let response: Response;
  try {
    response = await fetcher(HITPAY_SANDBOX_API + path, {
      method: body === undefined ? "GET" : "POST",
      // Workers supports manual/follow, not Fetch's "error" mode. Never forward
      // the business key to a redirect destination, even another HitPay host.
      redirect: "manual",
      signal: AbortSignal.timeout(18_000),
      headers: {
        "X-BUSINESS-API-KEY": key,
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ProviderFailure(false);
  }
  if (!response.ok) {
    throw new ProviderFailure([400, 401, 403, 404, 422].includes(response.status), response.status);
  }
  try { return await response.json(); }
  catch { throw new ProviderFailure(false); }
}
