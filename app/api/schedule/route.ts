import { requireUser } from '@/lib/auth';
import { createInboxItem, database, normalizeAndStore, updateInboxItem } from '@/lib/storage';
import { detectLanguage, type InboxItem } from '@/lib/inbox';
import { assertWrite, failure, HttpError, limitedJson, reply } from '@/lib/security';
import { eventSchema, validDay } from '@/lib/schedule';
import { z } from 'zod';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const user=await requireUser(request);const rows=await database().prepare('SELECT id,title,date,start,end,repeat_until AS repeatUntil,weekdays,location,kind,notes,file_id AS fileId FROM schedule_events WHERE user_id=? ORDER BY date,start').bind(user.userId).all<{weekdays:string}>();const checks=await database().prepare('SELECT event_id AS eventId,date FROM schedule_completions WHERE user_id=?').bind(user.userId).all();return reply({events:rows.results.map(e=>({...e,weekdays:JSON.parse(e.weekdays)})),completions:checks.results})}catch(e){return failure(e)}}
export async function POST(request:Request){try{
 assertWrite(request);const user=await requireUser(request),data=await limitedJson(request,400000),db=database();
 if(data.action==='complete'){
  if(typeof data.id!=='string'||!validDay(data.date)||typeof data.done!=='boolean')throw new HttpError('完成状态格式无效。');
  if(!await db.prepare('SELECT id FROM schedule_events WHERE id=? AND user_id=?').bind(data.id,user.userId).first())throw new HttpError('日程不存在。',404);
  if(data.done)await db.prepare('INSERT OR IGNORE INTO schedule_completions (id,user_id,event_id,date) VALUES (?,?,?,?)').bind(crypto.randomUUID(),user.userId,data.id,data.date).run();else await db.prepare('DELETE FROM schedule_completions WHERE user_id=? AND event_id=? AND date=?').bind(user.userId,data.id,data.date).run();return reply({ok:true});
 }
 if(data.action==='delete'){if(typeof data.id!=='string')throw new HttpError('缺少日程。');await db.batch([db.prepare('DELETE FROM schedule_completions WHERE event_id=? AND user_id=?').bind(data.id,user.userId),db.prepare('DELETE FROM schedule_events WHERE id=? AND user_id=?').bind(data.id,user.userId)]);return reply({ok:true})}
 if(data.action!=='save')throw new HttpError('不支持此操作。');const events=z.array(eventSchema).min(1).max(200).parse(data.events);
 const ids:string[]=[];const statements=[];for(const e of events){
  if(e.id&&!await db.prepare('SELECT id FROM schedule_events WHERE id=? AND user_id=?').bind(e.id,user.userId).first())throw new HttpError('日程不存在或无权编辑。',404);
  if(e.fileId&&!await db.prepare('SELECT id FROM files WHERE id=? AND user_id=?').bind(e.fileId,user.userId).first())e.fileId='';
  const id=e.id||crypto.randomUUID();ids.push(id);
  statements.push(db.prepare('INSERT INTO schedule_events (id,user_id,title,date,start,end,repeat_until,weekdays,location,kind,notes,file_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,date=excluded.date,start=excluded.start,end=excluded.end,repeat_until=excluded.repeat_until,weekdays=excluded.weekdays,location=excluded.location,kind=excluded.kind,notes=excluded.notes,file_id=excluded.file_id WHERE schedule_events.user_id=excluded.user_id').bind(id,user.userId,e.title,e.date,e.start,e.end,e.repeatUntil,JSON.stringify(e.weekdays),e.location,e.kind,e.notes,e.fileId));
 }
 const inboxWrites=events.map(async(e,index)=>{const id=ids[index],inboxId='schedule:'+id,originalText=[e.title,`${e.date} ${e.start}–${e.end}`,e.location,e.notes].filter(Boolean).join('\n'),metadata={schedule:{id,date:e.date,start:e.start,end:e.end,repeatUntil:e.repeatUntil,weekdays:e.weekdays,location:e.location,kind:e.kind,fileId:e.fileId}};let item:InboxItem;try{await updateInboxItem(inboxId,user.userId,'processing',{originalText,metadata});item={id:inboxId,user_id:user.userId,source_type:'schedule',source_reference:id,original_text:originalText,original_language:detectLanguage(originalText),processing_status:'processing',metadata,created_at:new Date().toISOString()}}catch{item=await createInboxItem({id:inboxId,user_id:user.userId,source_type:'schedule',source_reference:id,original_text:originalText,processing_status:'received',metadata})}await normalizeAndStore(item);await updateInboxItem(inboxId,user.userId,'ready',{originalText,metadata})});
 await Promise.all(inboxWrites);await db.batch(statements);return reply({ok:true,ids});
 }catch(e){if(e instanceof z.ZodError)return reply({error:e.issues[0].message},400);return failure(e)}}
