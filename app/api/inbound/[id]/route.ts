import { database } from '@/lib/storage';
import { digest, failure, HttpError, limitedJson, reply, same, throttle } from '@/lib/security';
import { importMessages } from '@/lib/importer';
import { z } from 'zod';
export const dynamic='force-dynamic';
const schema=z.object({batchId:z.string().min(1).max(160),text:z.string().min(2).max(200000),referenceDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()});
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{
 const {id}=await params,db=database(),source=await db.prepare('SELECT user_id AS userId,name,secret_hash AS secretHash FROM inbound_sources WHERE id=?').bind(id).first<{userId:string;name:string;secretHash:string}>();
 const token=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';if(!source||!/^[a-f0-9]{64}$/.test(token)||!same(await digest(token),source.secretHash))throw new HttpError('消息源凭据无效。',401);
 await throttle('inbound:'+id,120,3600);const data=schema.parse(await limitedJson(request));
 if(await db.prepare('SELECT id FROM inbound_receipts WHERE source_id=? AND external_id=?').bind(id,data.batchId).first())return reply({ok:true,duplicate:true});
 const report=await importMessages(source.userId,data.text,source.name,'text',{reference:data.referenceDate,mode:'rules',metadata:{connectorSourceId:id}});
 await db.batch([db.prepare('INSERT OR IGNORE INTO inbound_receipts (id,source_id,external_id,created_at) VALUES (?,?,?,?)').bind(crypto.randomUUID(),id,data.batchId,new Date().toISOString()),db.prepare('UPDATE inbound_sources SET last_received=? WHERE id=?').bind(new Date().toISOString(),id)]);
 return reply({ok:true,report});
 }catch(e){if(e instanceof z.ZodError)return reply({error:e.issues[0].message},400);return failure(e)}}
