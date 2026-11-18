import { database, initializeUser } from '@/lib/storage';
import { getUser, requireUser, newSession, clearSession, COOKIE } from '@/lib/auth';
import { assertWrite, digest, failure, HttpError, limitedJson, passwordHash, reply, throttle, verifyPassword } from '@/lib/security';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const user=await getUser(request);if(!user)return reply({user:null});const account=await database().prepare('SELECT username FROM accounts WHERE user_id=?').bind(user.userId).first<{username:string}>();return reply({user:{name:user.fullName,kind:user.kind,username:account?.username||''}})}catch(e){return failure(e)}}
export async function POST(request:Request){try{
 assertWrite(request);const data=await limitedJson(request,8000),db=database();
 if(data.action==='logout'){
  const token=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  if(token)await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(token)).run();
  return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json','Set-Cookie':clearSession,'Cache-Control':'no-store'}});
 }
 if(!['login','register','link','password'].includes(data.action))throw new HttpError('不支持此操作。');
 const ip=request.headers.get('cf-connecting-ip')||'unknown';await throttle('auth-ip:'+await digest(ip),40,900);
 if(typeof data.password!=='string'||data.password.length<10||data.password.length>128)throw new HttpError('密码需为 10–128 个字符。');
 if(data.action==='password'){
  const user=await requireUser(request);await throttle('password:'+user.userId,6,900);
  const account=await db.prepare('SELECT password_hash AS hash FROM accounts WHERE user_id=?').bind(user.userId).first<{hash:string}>();
  if(!account || typeof data.currentPassword!=='string' || !await verifyPassword(data.currentPassword,account.hash))throw new HttpError('当前密码不正确。',401);
  await db.batch([db.prepare('UPDATE accounts SET password_hash=? WHERE user_id=?').bind(await passwordHash(data.password),user.userId),db.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.userId)]);
  return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json','Set-Cookie':await newSession(user.userId),'Cache-Control':'no-store'}});
 }
 const username=String(data.username||'').trim().toLowerCase();if(!/^[a-z0-9][a-z0-9_.@-]{3,63}$/.test(username))throw new HttpError('账号需为 4–64 位字母、数字或 _ . @ -。');
 await throttle('auth-name:'+await digest(username),10,900);
 let userId='';
 if(data.action==='login'){
  const account=await db.prepare('SELECT user_id AS userId,password_hash AS hash FROM accounts WHERE username=?').bind(username).first<{userId:string;hash:string}>();
  const valid=await verifyPassword(data.password,account?.hash||'pbkdf2-sha256$100000$0000000000000000000000000000000000000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000');
  if(!account || !valid)throw new HttpError('账号或密码不正确。',401);userId=account.userId;await initializeUser(userId,'同学');
 }else{
  const user=data.action==='link'?await requireUser(request):null;userId=user?.userId||'campus:'+crypto.randomUUID();
  const name=typeof data.name==='string'?data.name.trim().slice(0,36):'同学';
  const exists=await db.prepare('SELECT id FROM accounts WHERE username=? OR user_id=?').bind(username,userId).first();if(exists)throw new HttpError('账号已被使用，或当前空间已绑定账号。',409);
  const hash=await passwordHash(data.password);
  try{await db.prepare('INSERT INTO accounts (id,user_id,username,password_hash,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),userId,username,hash,new Date().toISOString()).run()}catch{throw new HttpError('账号已被使用，请换一个账号。',409)}
  await initializeUser(userId,user?.fullName||name||'同学');
 }
 await db.prepare('DELETE FROM rate_limits WHERE key=?').bind('auth-name:'+await digest(username)).run();
 return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json','Set-Cookie':await newSession(userId),'Cache-Control':'no-store'}});
 }catch(e){return failure(e)}}
