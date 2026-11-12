import { AsyncLocalStorage } from "node:async_hooks";
import type { AuthIdentity } from "./auth";

const identity = new AsyncLocalStorage<AuthIdentity | null>();

export function runWithIdentity<T>(user: AuthIdentity | null, callback: () => T): T {
  return identity.run(user, callback);
}

export function currentIdentity(): AuthIdentity | null {
  return identity.getStore() ?? null;
}
