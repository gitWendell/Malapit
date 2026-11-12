import { and, eq, gte, or, desc } from "drizzle-orm";
import { getDb } from "../db";
import { listings } from "../db/schema";
import { currentIdentity } from "./auth-context";
import type { Listing } from "./types";
import { DEMO_LISTINGS } from "./demo";
import { isListingVisible } from "./availability";
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function identity() {
  return currentIdentity();
}
export async function requireUser() { const user = await identity(); if (!user) throw new HttpError(401, "Sign in to continue."); return user; }
export function checkOrigin(request: Request) { const origin = request.headers.get("origin"); if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") throw new HttpError(403, "Please submit this request from Malapit."); }
export function listingRecord(row: typeof listings.$inferSelect): Listing { const { data, ...rest } = row; return { ...JSON.parse(data), ...rest } as Listing; }
export function publicListing(row: typeof listings.$inferSelect): Listing {
  const property = listingRecord(row);
  if (!property.exactLocation) return { ...property, address: `${property.neighborhood}, ${property.city}`, lat: Math.round(property.lat * 1000) / 1000, lng: Math.round(property.lng * 1000) / 1000 };
  return property;
}
export async function findVisibleListing(id: string, userId?: string) {
  const demo = DEMO_LISTINGS.find(p => p.id === id); if (demo) return demo;
  const [row] = await getDb().select().from(listings).where(eq(listings.id, id));
  if (!row) throw new HttpError(404, "This listing could not be found.");
  if (row.status !== "published" && row.ownerId !== userId) throw new HttpError(404, "This listing is not available.");
  if (row.ownerId !== userId && !isListingVisible(row)) throw new HttpError(404, "Availability needs to be confirmed.");
  return listingRecord(row);
}
export function routeError(error: unknown) {
  if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
  const messages: string[] = [];
  for (let cause = error, depth = 0; cause && depth < 5; depth++) {
    if (!(cause instanceof Error)) break;
    messages.push(cause.message); cause = cause.cause;
  }
  const details = messages.join(" ");
  if (details.includes("PILOT_PROPERTIES_FULL")) return Response.json({ error: "The 30-property pilot is full. Please try again when a place opens." }, { status: 409 });
  if (details.includes("PILOT_STORAGE_FULL")) return Response.json({ error: "Photo uploads are paused because the pilot storage is full. Please contact Malapit." }, { status: 409 });
  if (details.includes("PILOT_UPLOAD_LIMIT")) return Response.json({ error: "You have reached the pilot limit of 10 photo uploads today. Please try again tomorrow." }, { status: 429 });
  if (details.includes("PILOT_PHOTO_REFERENCE")) return Response.json({ error: "Please use up to five of your own successfully uploaded photos." }, { status: 400 });
  if (error && typeof error === "object" && "issues" in error) { const issue = (error as { issues: { path: string[]; message: string }[] }).issues[0]; return Response.json({ error: `${issue.path.join(" ")}: ${issue.message}` }, { status: 400 }); }
  if (error instanceof SyntaxError) return Response.json({ error: "Please send a valid request." }, { status: 400 });
  console.error("Malapit request failed", error instanceof Error ? error.message : "Unknown error"); return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
export { and, eq, gte, or, desc, getDb };
