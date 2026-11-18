import { requireUser } from '@/lib/auth';
import { database } from '@/lib/storage';
import { failure, reply } from '@/lib/security';
import type { InboxItem, NormalizedMessage } from '@/lib/inbox';
export const dynamic='force-dynamic';

function json(value:string){try{return JSON.parse(value)}catch{return {}}}
type InboxRow=Omit<InboxItem,'metadata'> & {metadata:string};
type MessageRow=Omit<NormalizedMessage,'attachments'|'metadata'> & {attachments:string;metadata:string;inboxItemId:string};
export async function GET(request:Request){try{
 const user=await requireUser(request),db=database(),status=new URL(request.url).searchParams.get('status');
 const rows=await db.prepare(`SELECT id,user_id AS user_id,source_type AS source_type,source_reference AS source_reference,original_text AS original_text,original_language AS original_language,processing_status AS processing_status,metadata,created_at AS created_at FROM inbox_items WHERE user_id=?${status?' AND processing_status=?':''} ORDER BY created_at DESC LIMIT 200`).bind(user.userId,...(status?[status]:[])).all<InboxRow>();
 const messages=await db.prepare('SELECT id,user_id AS user_id,inbox_item_id AS inbox_item_id,normalization_id AS normalization_id,normalization_version AS normalization_version,source_type AS source_type,source_id AS source_id,text,language,timestamp,sender,attachments,metadata,confidence,inbox_item_id AS inboxItemId FROM normalized_messages WHERE user_id=? ORDER BY normalization_version,created_at,id').bind(user.userId).all<MessageRow>();
 return reply({items:rows.results.map(item=>({...item,metadata:json(item.metadata),normalizedMessages:messages.results.filter(message=>message.inboxItemId===item.id).map(message=>({...message,attachments:json(message.attachments),metadata:json(message.metadata)}))}))});
}catch(error){return failure(error)}}
