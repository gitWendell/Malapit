export const LOCAL_TEST_ACCOUNTS = {
  "1": { userId: "local_seedy", email: "local_seedy@sites.test", displayName: "Seedy" },
  renter: { userId: "local_renter", email: "local_renter@sites.test", displayName: "Test Renter" },
  other: { userId: "local_other", email: "local_other@sites.test", displayName: "Other Test User" },
} as const;
export function localTestAccount(value: string) { return LOCAL_TEST_ACCOUNTS[value as keyof typeof LOCAL_TEST_ACCOUNTS] ?? null; }
