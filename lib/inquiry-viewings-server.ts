import { env } from 'cloudflare:workers';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { inquiries, inquiryViewings } from '../db/schema';
import type { AuthIdentity } from './auth';
import { getDb, HttpError, routeError } from './server';
import { philippinesDay } from './rentals';
import { canChangeViewing, viewingActionInput, viewingInput, viewingTimeError, viewingTimes, VIEWING_LIMITS, type InquiryViewing, type ViewingHistory, type ViewingStatus } from './inquiry-viewings';

export const inquiryViewingSummary = sql<string | null>`(SELECT json_object('id',v.id,'inquiryId',v.inquiry_id,'ownerId',v.owner_id,'renterId',v.renter_id,'proposedBy',v.proposed_by,'startsAt',v.starts_at,'endsAt',v.ends_at,'note',v.note,'status',v.status,'version',v.version,'updatedBy',v.updated_by,'updatedAt',v.updated_at,'decisionNote',v.decision_note) FROM inquiry_viewings v WHERE v.inquiry_id=inquiries.id AND v.owner_id=inquiries.owner_id AND v.renter_id=inquiries.renter_id ORDER BY v.seq DESC LIMIT 1)`;
export const inquiryViewingActivity = sql<string>`coalesce((SELECT max(v.updated_at) FROM inquiry_viewings v WHERE v.inquiry_id=inquiries.id),inquiries.created_at)`;
const unavailable = () => new HttpError(404, 'This viewing is not available to this account.');
function database() { if (!env.DB) throw new HttpError(503, 'Viewings are temporarily unavailable.'); return env.DB; }
async function participant(id: string, user: AuthIdentity) {
  const [inquiry] = await getDb().select().from(inquiries).where(and(eq(inquiries.id,id),or(eq(inquiries.ownerId,user.userId),eq(inquiries.renterId,user.userId)))).limit(1);
  if (!inquiry || inquiry.isDemo) throw unavailable();
  return inquiry;
}
function record(row: typeof inquiryViewings.$inferSelect): InquiryViewing {
  return { id:row.id,inquiryId:row.inquiryId,ownerId:row.ownerId,renterId:row.renterId,proposedBy:row.proposedBy,startsAt:row.startsAt,endsAt:row.endsAt,note:row.note,status:row.status as ViewingStatus,version:row.version,updatedBy:row.updatedBy,updatedAt:row.updatedAt,decisionNote:row.decisionNote };
}
async function latestViewing(id: string, userId: string) {
  const [row]=await getDb().select().from(inquiryViewings).where(and(eq(inquiryViewings.inquiryId,id),or(eq(inquiryViewings.ownerId,userId),eq(inquiryViewings.renterId,userId)))).orderBy(desc(inquiryViewings.seq)).limit(1);
  return row?record(row):null;
}
export async function viewingHistory(id: string, user: AuthIdentity): Promise<ViewingHistory> {
  await participant(id,user);
  const rows=await getDb().select().from(inquiryViewings).where(and(eq(inquiryViewings.inquiryId,id),or(eq(inquiryViewings.ownerId,user.userId),eq(inquiryViewings.renterId,user.userId)))).orderBy(desc(inquiryViewings.seq)).limit(VIEWING_LIMITS.history+1);
  return {viewings:rows.slice(0,VIEWING_LIMITS.history).map(record),hasMore:rows.length>VIEWING_LIMITS.history};
}
export async function proposeViewing(id: string, input: unknown, user: AuthIdentity) {
  const data=viewingInput.parse(input),inquiry=await participant(id,user),times=viewingTimes(data),db=database();
  const existing=async()=>{
    const [saved]=await getDb().select().from(inquiryViewings).where(and(eq(inquiryViewings.id,data.requestId),eq(inquiryViewings.inquiryId,id),eq(inquiryViewings.proposedBy,user.userId))).limit(1);
    if(!saved)return null;
    if(saved.startsAt!==times.startsAt||saved.endsAt!==times.endsAt||saved.note!==data.note||saved.replacesId!==(data.replaceId??null))throw new HttpError(409,'This request already saved different viewing details. Refresh the conversation.');
    return {id:saved.id,viewing:await latestViewing(id,user.userId)};
  };
  const repeated=await existing();if(repeated)return repeated;
  const timeError=viewingTimeError(times.startsAt);if(timeError)throw new HttpError(400,timeError);
  const timestamp=new Date().toISOString(),statements:D1PreparedStatement[]=[];
  if(data.replaceId){
    const [old]=await getDb().select().from(inquiryViewings).where(and(eq(inquiryViewings.id,data.replaceId),eq(inquiryViewings.inquiryId,id))).limit(1);
    if(!old||![old.ownerId,old.renterId].includes(user.userId)||!['proposed','confirmed'].includes(old.status)||old.version!==data.replaceVersion)throw new HttpError(409,'The viewing changed. Refresh before suggesting another time.');
    // The insert checks that this exact old version was cancelled in this batch.
    statements.push(db.prepare("UPDATE inquiry_viewings SET status='cancelled',version=version+1,updated_by=?,updated_at=?,decision_note='Rescheduled' WHERE id=? AND version=? AND status IN('proposed','confirmed')").bind(user.userId,timestamp,old.id,old.version));
  }
  statements.push(db.prepare(`INSERT INTO inquiry_viewings(id,inquiry_id,owner_id,renter_id,proposed_by,starts_at,ends_at,note,updated_by,replaces_id,created_at,created_day,updated_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${data.replaceId ? "changes()=1" : "1"} RETURNING id`).bind(data.requestId,id,inquiry.ownerId,inquiry.renterId,user.userId,times.startsAt,times.endsAt,data.note,user.userId,data.replaceId??null,timestamp,philippinesDay(),timestamp));
  try{const result=await db.batch(statements);if(!result.at(-1)?.results?.length)throw new HttpError(409,'The viewing changed. Refresh before rescheduling.');}catch(cause){const saved=await existing();if(saved)return saved;throw cause;}
  return {id:data.requestId,viewing:await latestViewing(id,user.userId)};
}
export async function changeViewing(id: string, input: unknown, user: AuthIdentity) {
  const data=viewingActionInput.parse(input);await participant(id,user);
  const [row]=await getDb().select().from(inquiryViewings).where(and(eq(inquiryViewings.id,data.id),eq(inquiryViewings.inquiryId,id),or(eq(inquiryViewings.ownerId,user.userId),eq(inquiryViewings.renterId,user.userId)))).limit(1);
  if(!row)throw unavailable();
  const status=({confirm:'confirmed',decline:'declined',cancel:'cancelled',complete:'completed'} as const)[data.action];
  if(row.version===data.version+1&&row.status===status&&row.updatedBy===user.userId&&row.decisionNote===data.note)return {id:row.id,viewing:await latestViewing(id,user.userId)};
  if(row.version!==data.version||!canChangeViewing(record(row),user.userId,data.action))throw new HttpError(409,'This action is no longer available. Refresh the viewing.');
  const result=await database().prepare('UPDATE inquiry_viewings SET status=?,version=version+1,updated_by=?,updated_at=?,decision_note=? WHERE id=? AND version=? AND status=? RETURNING id')
    .bind(status,user.userId,new Date().toISOString(),data.note,row.id,row.version,row.status).first<{id:string}>();
  if(!result)throw new HttpError(409,'The viewing changed. Refresh the conversation.');
  return {...result,viewing:await latestViewing(id,user.userId)};
}
export function viewingError(cause: unknown) {
  const text=cause instanceof Error?[cause.message,cause.cause instanceof Error?cause.cause.message:''].join(' '):'';
  const errors:[string,string][]=[['VIEWING_OVERLAP','You or the other person already have a confirmed viewing at that time. Suggest another time.'],['VIEWING_RENTAL_STARTED','Rental details have already been shared, or this listing is no longer available for a viewing.'],['VIEWING_LIMIT','The viewing limit has been reached. You can send 20 requests per Philippine day.'],['VIEWING_DETAILS','Check the viewing date, time and duration.'],['VIEWING_PARTIES','This listing is no longer available for a viewing.'],['VIEWING_STATE','The viewing changed. Refresh before trying again.'],['VIEWING_REPLACE','The original viewing changed. Refresh before rescheduling.'],['UNIQUE constraint','There is already a viewing request for this conversation. Refresh to see it.']];
  const found=errors.find(([code])=>text.includes(code));const response=found?Response.json({error:found[1]},{status:409}):routeError(cause);
  response.headers.set('Cache-Control','private, no-store');return response;
}
