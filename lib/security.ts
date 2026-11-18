import { env } from 'cloudflare:workers';
import { database } from './storage';
const enc=new TextEncoder();
export const hex=(data:ArrayBuffer|Uint8Array)=>Array.from(new Uint8Array(data)).map(x=>x.toString(16).padStart(2,'0')).join('');
export const randomToken=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
export async function digest(value:string){return hex(await crypto.subtle.digest('SHA-256',enc.encode(value)))}
export async function passwordHash(password:string,salt=randomToken()){
 const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:enc.encode(salt),iterations:100000},key,256);
 return `pbkdf2-sha256$100000$${salt}$${hex(bits)}`;
}
export function same(a:string,b:string){let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0}
export async function verifyPassword(password:string,hash:string){return same(await passwordHash(password,hash.split('$')[2]),hash)}
export async function throttle(key:string,limit=15,seconds=900){
 const now=Math.floor(Date.now()/1000), db=database();
 const row=await db.prepare('INSERT INTO rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at < ? THEN 1 ELSE count+1 END, expires_at=CASE WHEN expires_at < ? THEN ? ELSE expires_at END RETURNING count').bind(key,now+seconds,now,now,now+seconds).first<{count:number}>();
 if((row?.count||0)>limit)throw new HttpError('操作过于频繁，请稍后重试。',429);
}
export function assertWrite(request:Request){
 if(request.headers.get('x-campus-action')!=='1')throw new HttpError('请求未通过校验，请刷新后重试。',403);
 const origin=request.headers.get('origin');
 if(origin && origin!==new URL(request.url).origin)throw new HttpError('请求来源不匹配。',403);
}
export class HttpError extends Error{constructor(message:string,public status=400){super(message)}}
export function reply(value:unknown,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
export function failure(error:unknown){if(error instanceof HttpError)return reply({error:error.message},error.status);console.error('Campus operation failed',error instanceof Error?error.name:'unknown');return reply({error:'暂时无法完成操作，输入已保留，请稍后重试。'},503)}
async function encryptionKey(){
 const raw=(env as unknown as Record<string,string>).CAMPUS_ENCRYPTION_KEY;
 if(!raw || !/^[a-f0-9]{64}$/.test(raw))throw new HttpError('接口密钥保护尚未启用，请联系网站管理员。',503);
 return crypto.subtle.importKey('raw',Uint8Array.from(raw.match(/../g)!,x=>parseInt(x,16)),{name:'AES-GCM'},false,['encrypt','decrypt']);
}
export function encryptionReady(){return !!(env as unknown as Record<string,string>).CAMPUS_ENCRYPTION_KEY}
export async function seal(value:string){const iv=crypto.getRandomValues(new Uint8Array(12));const result=await crypto.subtle.encrypt({name:'AES-GCM',iv},await encryptionKey(),enc.encode(value));return hex(iv)+':'+hex(result)}
export async function unseal(value:string){if(!value)return '';const [a,b]=value.split(':');const bytes=(s:string)=>Uint8Array.from(s.match(/../g)!,x=>parseInt(x,16));return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(a)},await encryptionKey(),bytes(b)))}
export async function limitedJson(request:Request,max=1100000){const raw=await request.text();if(raw.length>max)throw new HttpError('内容过长，请拆分后重试。',413);try{return JSON.parse(raw)}catch{throw new HttpError('请检查提交的数据格式。')}}
