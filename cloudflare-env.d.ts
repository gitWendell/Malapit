declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    LOCAL_PHOTOS?: R2Bucket;
    AUTH_MODE?: string;
    SUPABASE_URL?: string;
    SUPABASE_PUBLISHABLE_KEY?: string;
    SUPABASE_SECRET_KEY?: string;
    ADMIN_USER_IDS?: string;
  }
}
