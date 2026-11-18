import { getUser } from "@/lib/auth";
import { authorizeMcpUser, MCP_ISSUER, OAuthError, validateAuthorization } from "@/lib/mcp-oauth";
import { oauthFailure, requireSameOrigin } from "@/lib/mcp-oauth-http";
import { createConsentTransaction, recoverConsentTransaction } from "@/lib/mcp-consent-transaction";
import { encryptionReady, seal, unseal } from "@/lib/security";
export const dynamic="force-dynamic";
const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]!));
const page=(content:string)=>new Response(`<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>连接巨婴系统</title><style>body{font-family:system-ui,sans-serif;background:#f6f8fb;color:#172033;margin:0;padding:24px}main{max-width:520px;margin:8vh auto;background:#fff;border:1px solid #d9e2ed;border-radius:16px;padding:28px;line-height:1.6}button,a{font:inherit}button{background:#1657ad;color:#fff;border:0;border-radius:8px;padding:10px 18px;cursor:pointer}p{overflow-wrap:anywhere}small{color:#46546b}a{color:#1657ad}</style></head><body><main><h1>连接巨婴系统 · Big Baby</h1>${content}</main></body></html>`,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'","X-Content-Type-Options":"nosniff"}});
export async function GET(request:Request){
 const request_id=crypto.randomUUID();
 let step="QUERY_PARSE";
 // Only fixed labels and booleans are logged. OAuth values and exception messages are excluded.
 const mark=(next:string,status:"START"|"PASS"|"FAIL",result?:"FOUND"|"NOT_FOUND",config_present?:boolean,error_class?:string)=>{
  step=next;
  try{console.info(JSON.stringify({event:"oauth_authorize_get_step",request_id,step,status,...(result?{result}:{}),...(config_present===undefined?{}:{config_present}),...(error_class?{error_class}:{})}));}catch{/* Diagnostics cannot affect authorization. */}
 };
 try{
  mark("QUERY_PARSE","START");
  const url=new URL(request.url);
  mark("QUERY_PARSE","PASS");
  const authorization=await validateAuthorization(url.searchParams,mark);
  mark("USER_LOOKUP","START");
  const user=await getUser(request);
  mark("USER_LOOKUP","PASS",user?"FOUND":"NOT_FOUND");
  if(!user)return page(`<p>请先登录你自己的 Big Baby 账号，再返回此页刷新以继续连接。</p><p><a href="/" target="_blank" rel="noopener noreferrer">打开 Big Baby 登录页</a></p><small>仅授权将你明确选择的文本发送至你的账号，不上传整段聊天。</small>`);
  mark("TRANSACTION_CREATE","START");
  const params=new URLSearchParams({client_id:authorization.clientId,redirect_uri:authorization.redirectUri,response_type:"code",scope:authorization.scope,state:authorization.state,code_challenge:authorization.codeChallenge,code_challenge_method:"S256",resource:authorization.resource});
  mark("TRANSACTION_CREATE","PASS");
  mark("TRANSACTION_ENCRYPT","START",undefined,encryptionReady());
  const transaction=await createConsentTransaction(params,user.userId,seal);
  mark("TRANSACTION_ENCRYPT","PASS");
  mark("CONSENT_RENDER","START");
  const response=page(`<p>账号：${escape(user.fullName)}</p><p>ChatGPT 请求权限：<strong>${escape(authorization.scope)}</strong>，只能向 Big Baby 发送你明确交办的内容。内容仍需经过事项匹配与核对；你可随时撤销。</p><form method="post" action="/oauth/authorize"><input type="hidden" name="transaction" value="${escape(transaction)}"><button type="submit" name="consent" value="yes">同意连接</button> <button type="submit" name="consent" value="no">拒绝</button></form>`);
  mark("CONSENT_RENDER","PASS");
  return response;
 }catch(error){
  const error_class=error instanceof OAuthError?"OAuthError":error instanceof TypeError?"TypeError":error instanceof RangeError?"RangeError":error instanceof Error?"Error":"unknown";
  mark(step,"FAIL",undefined,undefined,error_class);
  return error instanceof OAuthError?page("<p>授权请求无效，请返回 ChatGPT 重新连接。</p>"):oauthFailure(error);
 }
}
export async function POST(request:Request){try{
 requireSameOrigin(request,MCP_ISSUER);
 if(!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded"))throw new OAuthError("invalid_request");
 const raw=await request.text();if(raw.length>8192)throw new OAuthError("invalid_request");
 const form=new URLSearchParams(raw);
 if(form.getAll("consent").length!==1)throw new OAuthError("invalid_request");
 const user=await getUser(request);
 if(!user)return page("<p>登录状态已失效，请先登录并重新发起连接。</p>");
 let transaction:URLSearchParams;
 try{transaction=await recoverConsentTransaction(form.get("transaction")||"",user.userId,unseal)}catch{throw new OAuthError("invalid_request")}
 const params=await validateAuthorization(transaction);
 if(form.get("consent")!=="yes"){
  const denied=new URL(params.redirectUri);denied.searchParams.set("error","access_denied");denied.searchParams.set("state",params.state);denied.searchParams.set("iss",MCP_ISSUER);
  return Response.redirect(denied,303);
 }
 return Response.redirect(await authorizeMcpUser(user.userId,transaction),303);
}catch(error){return oauthFailure(error)}}
