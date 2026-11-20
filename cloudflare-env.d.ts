declare namespace Cloudflare {
  interface Env {
    ASSETS: Fetcher;
    DB?: D1Database;
    LOCAL_PHOTOS?: R2Bucket;
    AUTH_MODE?: string;
    SUPABASE_URL?: string;
    SUPABASE_PUBLISHABLE_KEY?: string;
    SUPABASE_SECRET_KEY?: string;
    ADMIN_USER_IDS?: string;
    HITPAY_SANDBOX_API_KEY?: string;
    HITPAY_SANDBOX_WEBHOOK_SECRET?: string;
    HITPAY_SANDBOX_BUSINESS_ID?: string;
  }
}
