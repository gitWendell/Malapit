import { createClient } from "@supabase/supabase-js";
import { isLocalAuth } from "./auth.ts";
import { photoStorageConfigured, supabaseOrigin, type SupabaseConfig } from "./supabase-config.ts";

export const PHOTO_BUCKET = "malapit-photos";
type Config = SupabaseConfig & { LOCAL_PHOTOS?: R2Bucket };
export class PhotoStorageError extends Error {}

export function photosReady(request: Request, config: Config): boolean {
  return isLocalAuth(request, config) ? Boolean(config.LOCAL_PHOTOS) : photoStorageConfigured(config);
}

export function photoStore(request: Request, config: Config, fetcher: typeof fetch = fetch) {
  if (isLocalAuth(request, config) && config.LOCAL_PHOTOS) {
    const bucket = config.LOCAL_PHOTOS;
    return {
      async put(id: string, bytes: Uint8Array, contentType: string) { await bucket.put(id, bytes, { httpMetadata: { contentType } }); },
      async get(id: string) { const object = await bucket.get(id); return object ? { body: object.body as BodyInit, contentType: object.httpMetadata?.contentType ?? "image/jpeg" } : null; },
      async remove(id: string) { await bucket.delete(id); },
    };
  }
  if (!photoStorageConfigured(config)) throw new PhotoStorageError("Photo storage is being prepared.");
  // This key is server-only. No browser client, public bucket, or signed public
  // URL can bypass the app's ownership, publication, and pilot quota checks.
  const client = createClient(supabaseOrigin(config)!, config.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetcher(input, { ...init, signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(15_000)]) }) },
  });
  const bucket = client.storage.from(PHOTO_BUCKET);
  return {
    async put(id: string, bytes: Uint8Array, contentType: string) {
      const { error } = await bucket.upload(id, bytes, { contentType, upsert: false, cacheControl: "86400" });
      if (error) throw new PhotoStorageError("The photo could not be stored.");
    },
    async get(id: string) {
      const { data, error } = await bucket.download(id);
      if (error) {
        if ("statusCode" in error && String(error.statusCode) === "404") return null;
        throw new PhotoStorageError("The photo is temporarily unavailable.");
      }
      return data ? { body: data as BodyInit, contentType: data.type || "image/jpeg" } : null;
    },
    async remove(id: string) {
      const { error } = await bucket.remove([id]);
      if (error) throw new PhotoStorageError("The photo could not be removed.");
    },
  };
}
