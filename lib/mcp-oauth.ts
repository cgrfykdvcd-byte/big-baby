import { database } from "./storage";
import { digest, randomToken, throttle } from "./security";
import { allowedRedirect, pkceS256, tokenIsUsable } from "./mcp-oauth-policy";
export { allowedRedirect } from "./mcp-oauth-policy";

export const MCP_ISSUER="https://juying-campus-rosie.lzh2907846213.chatgpt.site";
// Sites currently reserves the root /mcp path at its edge. Keep the route
// available for hosts that forward it, and bind OAuth to the reachable alias.
export const MCP_RESOURCE=`${MCP_ISSUER}/api/mcp`;
export const MCP_SCOPE="handoff:create";
const ACCESS_LIFETIME=3600_000;
const REFRESH_LIFETIME=30*86400_000;
const CODE_LIFETIME=300_000;
const now=()=>Date.now();
const iso=()=>new Date().toISOString();
const tokenPattern=/^[a-f0-9]{64}$/;
const challengePattern=/^[A-Za-z0-9_-]{43}$/;
const verifierPattern=/^[A-Za-z0-9._~-]{43,128}$/;

export class OAuthError extends Error {
 constructor(public code:string,public status=400){super(code);}
}
type Client={id:string;redirectUris:string};
type Code={codeHash:string;userId:string;clientId:string;redirectUri:string;codeChallenge:string;resource:string;scope:string;expiresAt:number;usedAt:string|null};
type Token={tokenHash:string;credentialId:string;userId:string;clientId:string;familyId:string;kind:string;resource:string;scope:string;expiresAt:number;revokedAt:string|null};
export type ValidatedMcpIdentity={id:string;userId:string;status:string;scope:string;clientId:string;familyId:string};

function checkedScope(value:string){if(value!==MCP_SCOPE)throw new OAuthError("invalid_scope");return value;}
function checkedResource(value:string){if(value!==MCP_RESOURCE)throw new OAuthError("invalid_target");return value;}
async function clientFor(id:string){
 return database().prepare("SELECT id,redirect_uris AS redirectUris FROM mcp_oauth_clients WHERE id=?").bind(id).first<Client>();
}
export async function registerMcpClient(request:Request,body:unknown){
 const input=body&&typeof body==="object"&&!Array.isArray(body)?body as Record<string,unknown>:{};
 if(!Array.isArray(input.redirect_uris)||input.redirect_uris.length<1||input.redirect_uris.length>5||
  input.redirect_uris.some(uri=>typeof uri!=="string"||!allowedRedirect(uri))||
  (input.token_endpoint_auth_method!==undefined&&input.token_endpoint_auth_method!=="none")||
  (input.grant_types!==undefined&&JSON.stringify(input.grant_types)!==JSON.stringify(["authorization_code","refresh_token"])&&JSON.stringify(input.grant_types)!==JSON.stringify(["authorization_code"]))||
  (input.response_types!==undefined&&JSON.stringify(input.response_types)!==JSON.stringify(["code"])))
  throw new OAuthError("invalid_client_metadata");
 const ip=request.headers.get("cf-connecting-ip")||"unknown";
 await throttle(`mcp-dcr:${await digest(ip)}`,20,3600);
 const id=`bb_${crypto.randomUUID()}`,redirectUris=[...new Set(input.redirect_uris as string[])];
 await database().prepare("INSERT INTO mcp_oauth_clients (id,redirect_uris,created_at) VALUES (?,?,?)").bind(id,JSON.stringify(redirectUris),iso()).run();
 return {client_id:id,client_id_issued_at:Math.floor(now()/1000),redirect_uris:redirectUris,grant_types:["authorization_code","refresh_token"],response_types:["code"],token_endpoint_auth_method:"none"};
}
type AuthorizationStep="CLIENT_LOOKUP"|"REDIRECT_URI_VALIDATION"|"RESPONSE_TYPE_VALIDATION"|"PKCE_VALIDATION"|"STATE_VALIDATION"|"SCOPE_VALIDATION"|"RESOURCE_VALIDATION";
type AuthorizationObserver=(step:AuthorizationStep,status:"START"|"PASS",result?:"FOUND"|"NOT_FOUND")=>void;
export async function validateAuthorization(query:URLSearchParams,observe?:AuthorizationObserver){
 const clientId=query.get("client_id")||"",redirectUri=query.get("redirect_uri")||"";
 observe?.("CLIENT_LOOKUP","START");
 const client=await clientFor(clientId);
 observe?.("CLIENT_LOOKUP","PASS",client?"FOUND":"NOT_FOUND");
 observe?.("REDIRECT_URI_VALIDATION","START");
 if(!client||!JSON.parse(client.redirectUris).includes(redirectUri)||!allowedRedirect(redirectUri))throw new OAuthError("invalid_request");
 observe?.("REDIRECT_URI_VALIDATION","PASS");
 observe?.("RESPONSE_TYPE_VALIDATION","START");
 if(query.get("response_type")!=="code")throw new OAuthError("invalid_request");
 observe?.("RESPONSE_TYPE_VALIDATION","PASS");
 observe?.("PKCE_VALIDATION","START");
 if(!challengePattern.test(query.get("code_challenge")||"")||query.get("code_challenge_method")!=="S256")throw new OAuthError("invalid_request");
 observe?.("PKCE_VALIDATION","PASS");
 observe?.("STATE_VALIDATION","START");
 if(!query.get("state")||query.get("state")!.length>512)throw new OAuthError("invalid_request");
 observe?.("STATE_VALIDATION","PASS");
 observe?.("SCOPE_VALIDATION","START");checkedScope(query.get("scope")||"");observe?.("SCOPE_VALIDATION","PASS");
 observe?.("RESOURCE_VALIDATION","START");checkedResource(query.get("resource")||"");observe?.("RESOURCE_VALIDATION","PASS");
 return {clientId,redirectUri,codeChallenge:query.get("code_challenge")!,state:query.get("state")!,scope:MCP_SCOPE,resource:MCP_RESOURCE};
}
export async function authorizeMcpUser(userId:string,query:URLSearchParams){
 const params=await validateAuthorization(query),code=randomToken(),createdAt=iso();
 await database().prepare("INSERT INTO mcp_oauth_codes (code_hash,user_id,client_id,redirect_uri,code_challenge,resource,scope,expires_at,used_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(await digest(code),userId,params.clientId,params.redirectUri,params.codeChallenge,params.resource,params.scope,now()+CODE_LIFETIME,null,createdAt).run();
 const redirect=new URL(params.redirectUri);
 redirect.searchParams.set("code",code);redirect.searchParams.set("state",params.state);redirect.searchParams.set("iss",MCP_ISSUER);
 return redirect.toString();
}
async function issueToken(kind:"access"|"refresh",grant:{userId:string;clientId:string;credentialId:string;familyId:string;scope:string;resource:string}){
 const raw=randomToken();
 await database().prepare("INSERT INTO mcp_oauth_tokens (token_hash,credential_id,user_id,client_id,family_id,kind,resource,scope,expires_at,revoked_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(await digest(raw),grant.credentialId,grant.userId,grant.clientId,grant.familyId,kind,grant.resource,grant.scope,now()+(kind==="access"?ACCESS_LIFETIME:REFRESH_LIFETIME),null,iso()).run();
 return raw;
}
async function pair(grant:{userId:string;clientId:string;credentialId:string;familyId:string;scope:string;resource:string}){
 const access_token=await issueToken("access",grant),refresh_token=await issueToken("refresh",grant);
 return {access_token,token_type:"Bearer",expires_in:ACCESS_LIFETIME/1000,refresh_token,scope:grant.scope};
}
export async function exchangeMcpToken(form:URLSearchParams){
 const clientId=form.get("client_id")||"",client=await clientFor(clientId);
 if(!client)throw new OAuthError("invalid_client",401);
 const resource=checkedResource(form.get("resource")||"");
 if(form.get("grant_type")==="authorization_code"){
  const code=form.get("code")||"",verifier=form.get("code_verifier")||"",redirectUri=form.get("redirect_uri")||"";
  if(!tokenPattern.test(code)||!verifierPattern.test(verifier))throw new OAuthError("invalid_grant");
  const row=await database().prepare("SELECT code_hash AS codeHash,user_id AS userId,client_id AS clientId,redirect_uri AS redirectUri,code_challenge AS codeChallenge,resource,scope,expires_at AS expiresAt,used_at AS usedAt FROM mcp_oauth_codes WHERE code_hash=?").bind(await digest(code)).first<Code>();
  if(!row||row.clientId!==clientId||row.redirectUri!==redirectUri||!JSON.parse(client.redirectUris).includes(redirectUri)||
   row.resource!==resource||row.usedAt||row.expiresAt<=now()||row.codeChallenge!==await pkceS256(verifier))throw new OAuthError("invalid_grant");
  const consumed=await database().prepare("UPDATE mcp_oauth_codes SET used_at=? WHERE code_hash=? AND used_at IS NULL AND expires_at>?").bind(iso(),row.codeHash,now()).run();
  if(consumed.meta.changes!==1)throw new OAuthError("invalid_grant");
  // This existing credential is the sole bridge to the unchanged handoff service.
  const {createChatGptCredential}=await import("./chatgpt-handoff");
  const created=await createChatGptCredential(row.userId);
  return pair({userId:row.userId,clientId,credentialId:created.credential.id,familyId:crypto.randomUUID(),scope:row.scope,resource});
 }
 if(form.get("grant_type")==="refresh_token"){
  const refresh=form.get("refresh_token")||"";
  if(!tokenPattern.test(refresh))throw new OAuthError("invalid_grant");
  const row=await tokenRow(refresh);
  if(!row||row.kind!=="refresh"||row.clientId!==clientId||row.resource!==resource||row.revokedAt||row.expiresAt<=now()||row.scope!==MCP_SCOPE)throw new OAuthError("invalid_grant");
  const credential=await activeCredential(row.credentialId,row.userId);
  if(!credential)throw new OAuthError("invalid_grant");
  const used=await database().prepare("UPDATE mcp_oauth_tokens SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?").bind(iso(),row.tokenHash,now()).run();
  if(used.meta.changes!==1)throw new OAuthError("invalid_grant");
  return pair({userId:row.userId,clientId,credentialId:row.credentialId,familyId:row.familyId,scope:row.scope,resource});
 }
 throw new OAuthError("unsupported_grant_type");
}
async function tokenRow(raw:string){
 if(!tokenPattern.test(raw))return null;
 return database().prepare("SELECT token_hash AS tokenHash,credential_id AS credentialId,user_id AS userId,client_id AS clientId,family_id AS familyId,kind,resource,scope,expires_at AS expiresAt,revoked_at AS revokedAt FROM mcp_oauth_tokens WHERE token_hash=?").bind(await digest(raw)).first<Token>();
}
async function activeCredential(id:string,userId:string){
 return database().prepare("SELECT id,user_id AS userId,status FROM external_integration_credentials WHERE id=? AND user_id=? AND provider='chatgpt' AND status='active'").bind(id,userId).first<{id:string;userId:string;status:string}>();
}
export async function validateMcpAccessToken(raw:string):Promise<ValidatedMcpIdentity|null>{
 const token=await tokenRow(raw);
 if(!token||!tokenIsUsable(token,MCP_RESOURCE,now()))return null;
 const credential=await activeCredential(token.credentialId,token.userId);
 return credential?{...credential,scope:token.scope,clientId:token.clientId,familyId:token.familyId}:null;
}
export async function revokeMcpToken(raw:string,clientId:string){
 const row=await tokenRow(raw);
 if(!row||row.clientId!==clientId)return;
 await database().prepare("UPDATE mcp_oauth_tokens SET revoked_at=? WHERE family_id=? AND revoked_at IS NULL").bind(iso(),row.familyId).run();
 await database().prepare("UPDATE external_integration_credentials SET status='revoked',revoked_at=? WHERE id=? AND user_id=? AND provider='chatgpt' AND status='active'").bind(iso(),row.credentialId,row.userId).run();
}
