export type SupabaseConfig = {
  AUTH_MODE?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
  ADMIN_USER_IDS?: string;
};

export function supabaseOrigin(config: SupabaseConfig): string | null {
  try {
    const url = new URL(config.SUPABASE_URL ?? "");
    if (url.protocol !== "https:" || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    return url.origin;
  } catch { return null; }
}

export function signInConfigured(config: SupabaseConfig): boolean {
  return config.AUTH_MODE === "supabase" && Boolean(supabaseOrigin(config) && config.SUPABASE_PUBLISHABLE_KEY);
}

export function photoStorageConfigured(config: SupabaseConfig): boolean {
  return config.AUTH_MODE === "supabase" && Boolean(supabaseOrigin(config) && config.SUPABASE_SECRET_KEY);
}
