import { env } from 'cloudflare:workers';
import { requireUser } from '@/lib/auth';
import { createInboxItem, database } from '@/lib/storage';
import { assertWrite, failure, HttpError, reply, throttle } from '@/lib/security';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 const user=await requireUser(request),db=database(),id=new URL(request.url).searchParams.get('id');
 if(id&&new URL(request.url).searchParams.get('text')==='1'){const file=await db.prepare('SELECT id,name,text FROM files WHERE id=? AND user_id=?').bind(id,user.userId).first();if(!file)throw new HttpError('文件不存在。',404);return reply(file)}
 if(id){const f=await db.prepare('SELECT name,mime,object_key AS objectKey FROM files WHERE id=? AND user_id=?').bind(id,user.userId).first<{name:string;mime:string;objectKey:string}>();if(!f)throw new HttpError('文件不存在。',404);const object=await env.BUCKET?.get(f.objectKey);if(!object)throw new HttpError('文件暂时无法读取。',503);return new Response(object.body,{headers:{'Content-Type':f.mime,'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(f.name),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
 const files=await db.prepare('SELECT id,name,mime,size,status,created_at AS createdAt FROM files WHERE user_id=? ORDER BY created_at DESC LIMIT 200').bind(user.userId).all();return reply({files:files.results});
 }catch(e){return failure(e)}}
export async function POST(request:Request){try{
 assertWrite(request);const user=await requireUser(request);await throttle('upload:'+user.userId,60,3600);
 if(!env.BUCKET)throw new HttpError('文件存储暂时不可用，请稍后重试。',503);
 if(Number(request.headers.get('content-length')||0)>17*1024*1024)throw new HttpError('单个文件最多 15 MB。',413);
 const form=await request.formData(),file=form.get('file'),text=String(form.get('text')||'');if(!(file instanceof File)||file.size>15*1024*1024||file.size===0)throw new HttpError('请选择不超过 15 MB 的文件。');
 const ext=file.name.split('.').pop()?.toLowerCase()||'';if(!['txt','md','csv','tsv','json','ics','docx','xlsx','pdf','png','jpg','jpeg','webp'].includes(ext))throw new HttpError('此文件格式暂不支持。');if(text.length>200000)throw new HttpError('文本最多 20 万字。');
 const id=crypto.randomUUID(),key=user.userId+'/'+id,name=file.name.replace(/[\x00-\x1f]/g,'').slice(0,200),mime=({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',pdf:'application/pdf'} as Record<string,string>)[ext]||'application/octet-stream';
 await env.BUCKET.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:mime}});
 try{const createdAt=new Date().toISOString();await database().prepare('INSERT INTO files (id,user_id,name,mime,size,object_key,text,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,user.userId,name,mime,file.size,key,text,text?'ready':'stored',createdAt).run();await createInboxItem({id:'file:'+id,user_id:user.userId,source_type:mime.startsWith('image/')?'image':'file',source_reference:id,original_text:text,processing_status:text?'received':'processing',metadata:{attachments:[{fileId:id,name,mime,size:file.size}]},created_at:createdAt})}catch(e){await env.BUCKET.delete(key);throw e}
 return reply({file:{id,name,mime,size:file.size,status:text?'ready':'stored'},text});
 }catch(e){return failure(e)}}
export async function DELETE(request:Request){try{assertWrite(request);const user=await requireUser(request),id=new URL(request.url).searchParams.get('id');const file=await database().prepare('SELECT object_key AS objectKey FROM files WHERE id=? AND user_id=?').bind(id,user.userId).first<{objectKey:string}>();if(!file)throw new HttpError('文件不存在。',404);if(!env.BUCKET)throw new HttpError('文件存储暂时不可用。',503);await env.BUCKET.delete(file.objectKey);await database().prepare('DELETE FROM files WHERE id=? AND user_id=?').bind(id,user.userId).run();return reply({ok:true})}catch(e){return failure(e)}}
