import { z } from "zod";

export const INQUIRY_MESSAGE_LIMITS = { pageSize: 30, dailyPerPerson: 100, total: 20000 } as const;
export const inquiryMessageInput = z.object({ requestId: z.string().uuid(), body: z.string().trim().min(1, "Write a message first.").max(2000, "Keep your message within 2,000 characters.") });
export const inquiryMessageQuery = z.object({ before: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(), after: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional() }).refine(value => value.before === undefined || value.after === undefined, "Choose one message cursor.");
export type InquiryMessageRole = "owner" | "renter" | "reviewer";
export type InquiryMessage = { seq: number; id: string; inquiryId: string; senderId: string; senderName: string; role: InquiryMessageRole; body: string; createdAt: string; createdDay: string };
export type InquiryMessagesPage = { legacyReply: string; messages: InquiryMessage[]; hasMore: boolean; canReply: boolean };
export function inquiryParticipantRole(inquiry: { ownerId: string; renterId: string }, user: { userId: string; isAdmin: boolean }): InquiryMessageRole | null {
  return inquiry.ownerId === user.userId ? "owner" : inquiry.renterId === user.userId ? "renter" : user.isAdmin ? "reviewer" : null;
}
