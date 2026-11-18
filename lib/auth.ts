import { getChatGPTUser } from '@/app/chatgpt-auth';
import { database } from './storage';
import { digest, HttpError, randomToken } from './security';
export const COOKIE='__Host-campus-session';
export async function getUser(request:Request){
 const token=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 if(token && /^[a-f0-9]{64}$/.test(token)){
  const session=await database().prepare('SELECT s.user_id AS userId,p.name AS fullName FROM sessions s JOIN profiles p ON p.user_id=s.user_id WHERE token_hash=? AND expires_at>?').bind(await digest(token),Date.now()).first<{userId:string;fullName:string}>();
  if(session)return {...session,kind:'password'};
 }
 const platform=await getChatGPTUser();return platform?{userId:platform.userId,fullName:platform.fullName||'同学',kind:'chatgpt'}:null;
}
export async function requireUser(request:Request){const user=await getUser(request);if(!user)throw new HttpError('请登录后使用你的校园空间。',401);return user}
export async function newSession(userId:string){const token=randomToken();await database().prepare('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').bind(await digest(token),userId,Date.now()+7*86400000).run();return `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=604800`}
export const clearSession=`${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`;
