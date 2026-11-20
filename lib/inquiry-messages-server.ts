import { and, asc, desc, eq, gt, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { inquiries, inquiryMessages } from "../db/schema";
import type { AuthIdentity } from "./auth";
import { getDb, HttpError, routeError } from "./server";
import { philippinesDay } from "./rentals";
import { INQUIRY_MESSAGE_LIMITS, inquiryMessageInput, inquiryMessageQuery, inquiryParticipantRole, type InquiryMessage, type InquiryMessagesPage } from "./inquiry-messages";
import { inquiryActivitySql, inquiryLastMessageSql, inquiryReplySql } from "./inquiry-message-sql";

async function accessibleInquiry(id: string, user: AuthIdentity) {
  if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, "This conversation is not available to this account.");
  const [row] = await getDb().select().from(inquiries).where(eq(inquiries.id, id)).limit(1);
  if (!row || !inquiryParticipantRole(row, user)) throw new HttpError(404, "This conversation is not available to this account.");
  return row;
}

export async function inquiryMessagesFor(id: string, url: URL, user: AuthIdentity): Promise<InquiryMessagesPage> {
  const inquiry = await accessibleInquiry(id, user);
  const query = inquiryMessageQuery.parse({ before: url.searchParams.get("before") ?? undefined, after: url.searchParams.get("after") ?? undefined });
  const forward = query.after !== undefined;
  const rows = await getDb().select().from(inquiryMessages).where(and(eq(inquiryMessages.inquiryId, id), forward ? gt(inquiryMessages.seq, query.after!) : query.before ? lt(inquiryMessages.seq, query.before) : undefined)).orderBy(forward ? asc(inquiryMessages.seq) : desc(inquiryMessages.seq)).limit(INQUIRY_MESSAGE_LIMITS.pageSize + 1);
  const page = rows.slice(0, INQUIRY_MESSAGE_LIMITS.pageSize);
  return { legacyReply: inquiry.reply, messages: (forward ? page : page.reverse()) as InquiryMessage[], hasMore: rows.length > INQUIRY_MESSAGE_LIMITS.pageSize, canReply: true };
}

export async function createInquiryMessage(id: string, input: unknown, user: AuthIdentity) {
  const inquiry = await accessibleInquiry(id, user), data = inquiryMessageInput.parse(input), db = getDb();
  const replay = async () => {
    const [row] = await db.select().from(inquiryMessages).where(eq(inquiryMessages.id, data.requestId)).limit(1);
    if (!row) return null;
    if (row.inquiryId !== id || row.senderId !== user.userId || row.body !== data.body) throw new HttpError(409, "This send request already contains a different message. Try again with a new message.");
    return row as InquiryMessage;
  };
  let saved = await replay();
  if (!saved) {
    const timestamp = new Date();
    try { const rows = await db.insert(inquiryMessages).values({ id: data.requestId, inquiryId: id, senderId: user.userId, senderName: user.displayName || (inquiry.renterId === user.userId ? "Renter" : "Lister"), role: inquiryParticipantRole(inquiry, user)!, body: data.body, createdAt: timestamp.toISOString(), createdDay: philippinesDay(timestamp) }).returning(); saved = rows[0] as InquiryMessage; }
    catch (error) { saved = await replay(); if (!saved) throw error; }
  }
  return { message: saved };
}

// Keep the old one-reply preview working without overwriting the original reply.
export const inquiryReplyPreview = sql<string>`${sql.raw(inquiryReplySql)}`;
export const inquiryLastMessage = sql<string | null>`${sql.raw(inquiryLastMessageSql)}`;
export const inquiryActivity = sql<string>`${sql.raw(inquiryActivitySql)}`;
export function inquiryMessageError(error: unknown): Response {
  const details: string[] = [];
  for (let cause = error, depth = 0; cause instanceof Error && depth < 5; cause = cause.cause, depth++) details.push(cause.message);
  const message = details.join(" ");
  if (message.includes("INQUIRY_MESSAGES_DAILY")) return Response.json({ error: "You have reached today's 100-message testing limit. Please try again tomorrow." }, { status: 429, headers: { "Cache-Control": "private, no-store" } });
  if (message.includes("INQUIRY_MESSAGES_FULL")) return Response.json({ error: "Messages have reached the testing storage limit. Please contact Malapit support." }, { status: 429, headers: { "Cache-Control": "private, no-store" } });
  const response = routeError(error); response.headers.set("Cache-Control", "private, no-store"); return response;
}
