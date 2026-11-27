import { z } from 'zod';

export const VIEWING_LIMITS = { total: 5000, perDay: 20, history: 20, futureDays: 90 };
export type ViewingStatus = 'proposed' | 'confirmed' | 'completed' | 'declined' | 'cancelled';
export type InquiryViewing = {
  id: string; inquiryId: string; ownerId: string; renterId: string; proposedBy: string; startsAt: string; endsAt: string; note: string;
  status: ViewingStatus; version: number; updatedBy: string; updatedAt: string; decisionNote: string;
};
export type ViewingHistory = { viewings: InquiryViewing[]; hasMore: boolean };
export const viewingInput = z.object({
  requestId: z.string().uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  duration: z.union([z.literal(30), z.literal(60)]).default(30), note: z.string().trim().max(500).default(''),
  replaceId: z.string().uuid().optional(), replaceVersion: z.number().int().positive().optional(),
}).superRefine((value, ctx) => {
  if (Boolean(value.replaceId) !== Boolean(value.replaceVersion)) ctx.addIssue({ code: 'custom', message: 'Refresh the viewing before suggesting another time.' });
  const date = new Date(value.date + 'T00:00:00+08:00');
  if (!Number.isFinite(date.getTime()) || new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10) !== value.date) ctx.addIssue({ code: 'custom', path: ['date'], message: 'Choose a valid viewing date.' });
});
export const viewingActionInput = z.object({
  id: z.string().uuid(), version: z.number().int().positive(), action: z.enum(['confirm', 'decline', 'cancel', 'complete']), note: z.string().trim().max(300).default(''),
});
export function viewingTimes(input: z.infer<typeof viewingInput>) {
  const start = new Date(`${input.date}T${input.time}:00+08:00`);
  return { startsAt: start.toISOString(), endsAt: new Date(start.getTime() + input.duration * 60000).toISOString() };
}
export function viewingTimeError(startsAt: string, now = new Date()): string | null {
  const time = new Date(startsAt).getTime();
  if (!Number.isFinite(time) || time <= now.getTime()) return 'Choose a viewing time that is still ahead, in Philippine time.';
  if (time > now.getTime() + VIEWING_LIMITS.futureDays * 86400000) return 'Choose a viewing within the next 90 days.';
  return null;
}
export function canChangeViewing(viewing: InquiryViewing, userId: string, action: z.infer<typeof viewingActionInput>['action'], now = new Date()): boolean {
  if (![viewing.ownerId, viewing.renterId].includes(userId)) return false;
  if (action === 'cancel') return ['proposed', 'confirmed'].includes(viewing.status);
  if (action === 'confirm' || action === 'decline') return viewing.status === 'proposed' && viewing.proposedBy !== userId && (action === 'decline' || viewing.startsAt > now.toISOString());
  return action === 'complete' && viewing.status === 'confirmed' && userId === viewing.ownerId && viewing.startsAt <= now.toISOString();
}
export function formatViewingTime(startsAt: string) {
  return new Intl.DateTimeFormat('en-PH', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }).format(new Date(startsAt));
}
