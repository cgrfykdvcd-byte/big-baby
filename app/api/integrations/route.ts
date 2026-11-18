import { requireUser } from '@/lib/auth';
import { aiConfig, completion, validateEndpoint } from '@/lib/ai';
import { database } from '@/lib/storage';
import { assertWrite, digest, encryptionReady, failure, HttpError, limitedJson, randomToken, reply, seal, throttle } from '@/lib/security';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const user=await requireUser(request),db=database(),cfg=await aiConfig(user.userId);const sources=await db.prepare('SELECT id,name,last_received AS lastReceived,created_at AS createdAt FROM inbound_sources WHERE user_id=? ORDER BY created_at DESC').bind(user.userId).all();const runs=await db.prepare('SELECT kind,engine,count,warnings,created_at AS createdAt FROM analysis_runs WHERE user_id=? ORDER BY created_at DESC LIMIT 20').bind(user.userId).all();return reply({ai:{baseUrl:cfg?.baseUrl||'',model:cfg?.model||'',visionModel:cfg?.visionModel||'',enabled:!!cfg?.enabled,hasKey:!!cfg?.apiKey,encryptionReady:encryptionReady()},sources:sources.results,runs:runs.results})}catch(e){return failure(e)}}
export async function POST(request:Request){try{
 assertWrite(request);const user=await requireUser(request),data=await limitedJson(request,12000),db=database();
 if(data.action==='save_ai'){
  const base=validateEndpoint(String(data.baseUrl||''));const model=String(data.model||'').trim(),vision=String(data.visionModel||'').trim();if(!model||model.length>120||vision.length>120)throw new HttpError('请填写有效模型名称。');
  const old=await aiConfig(user.userId);if(typeof data.apiKey!=='string'||data.apiKey.length>4096)throw new HttpError('请填写有效接口密钥。');if(old?.apiKey&&old.baseUrl!==base&&!data.apiKey)throw new HttpError('更换服务商地址时，请同时填写对应的新密钥。');const secret=data.apiKey?await seal(data.apiKey):old?.apiKey||'';if(data.enabled&&!secret)throw new HttpError('启用 AI 前请填写 API Key。');
  await db.prepare('INSERT INTO integrations (user_id,base_url,model,vision_model,api_key,enabled) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET base_url=excluded.base_url,model=excluded.model,vision_model=excluded.vision_model,api_key=excluded.api_key,enabled=excluded.enabled').bind(user.userId,base,model,vision,secret,data.enabled?1:0).run();return reply({ok:true});
 }
 if(data.action==='remove_ai'){await db.prepare('DELETE FROM integrations WHERE user_id=?').bind(user.userId).run();return reply({ok:true})}
 if(data.action==='test_ai'){await throttle('test-ai:'+user.userId,10,3600);const cfg=await aiConfig(user.userId);if(!cfg)throw new HttpError('请先保存并启用配置。');const result=await completion(cfg,'仅输出 JSON：{"ok":true}', '连接测试');if(result.ok!==true)throw new HttpError('模型未返回预期结果，请核对配置。',502);return reply({ok:true})}
 if(data.action==='create_source'){
  const name=String(data.name||'').trim();if(name.length<2||name.length>80)throw new HttpError('来源名称需为 2–80 个字符。');await throttle('create-source:'+user.userId,10,3600);const id=crypto.randomUUID(),token=randomToken();await db.prepare('INSERT INTO inbound_sources (id,user_id,name,secret_hash,last_received,created_at) VALUES (?,?,?,?,?,?)').bind(id,user.userId,name,await digest(token),'',new Date().toISOString()).run();return reply({id,token,path:'/api/inbound/'+id});
 }
 if(data.action==='delete_source'){await db.batch([db.prepare('DELETE FROM inbound_receipts WHERE source_id IN (SELECT id FROM inbound_sources WHERE id=? AND user_id=?)').bind(data.id,user.userId),db.prepare('DELETE FROM inbound_sources WHERE id=? AND user_id=?').bind(data.id,user.userId)]);return reply({ok:true})}
 throw new HttpError('不支持此操作。');
 }catch(e){return failure(e)}}
