import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";

// Exercise the actual GET/POST route with synthetic users, registered clients,
// and encrypted storage. No production account or OAuth code is involved.
const root=path.resolve(import.meta.dirname,"..");
const require=createRequire(import.meta.url);
const {build}=require(require.resolve("esbuild",{paths:[require.resolve("vite")]}));
const fake={
 "@/lib/auth":`export async function getUser(request){if(globalThis.oauthDiagnosticFailure==="USER_LOOKUP")throw Error("synthetic user lookup failure");const userId=request.headers.get("cookie");return userId?{userId,fullName:"Test User"}:null}`,
 "@/lib/security":`const store=new Map();export function encryptionReady(){return true}export async function seal(value){if(globalThis.oauthDiagnosticFailure==="TRANSACTION_ENCRYPT")throw Error("synthetic encryption failure");const key=crypto.randomUUID();store.set(key,value);return key}export async function unseal(key){if(!store.has(key))throw Error("invalid");return store.get(key)}`,
 "@/lib/mcp-oauth":`export const MCP_ISSUER="https://big-baby.example";export class OAuthError extends Error{constructor(code,status=400){super(code);this.code=code;this.status=status}}
export async function validateAuthorization(q,observe){observe?.("CLIENT_LOOKUP","START");if(globalThis.oauthDiagnosticFailure==="CLIENT_LOOKUP")throw Error("synthetic client lookup failure");observe?.("CLIENT_LOOKUP","PASS","FOUND");const clientId=q.get("client_id"),redirectUri=q.get("redirect_uri");observe?.("REDIRECT_URI_VALIDATION","START");if(clientId!=="registered"||redirectUri!=="https://chatgpt.com/connector_platform_oauth_redirect")throw new OAuthError("invalid_request");observe?.("REDIRECT_URI_VALIDATION","PASS");observe?.("RESPONSE_TYPE_VALIDATION","START");if(q.get("response_type")!=="code")throw new OAuthError("invalid_request");observe?.("RESPONSE_TYPE_VALIDATION","PASS");observe?.("PKCE_VALIDATION","START");if(q.get("code_challenge_method")!=="S256"||!/^[A-Za-z0-9_-]{43}$/.test(q.get("code_challenge")||""))throw new OAuthError("invalid_request");observe?.("PKCE_VALIDATION","PASS");observe?.("STATE_VALIDATION","START");if(!q.get("state"))throw new OAuthError("invalid_request");observe?.("STATE_VALIDATION","PASS");observe?.("SCOPE_VALIDATION","START");if(q.get("scope")!=="handoff:create")throw new OAuthError("invalid_scope");observe?.("SCOPE_VALIDATION","PASS");observe?.("RESOURCE_VALIDATION","START");if(q.get("resource")!==MCP_ISSUER+"/api/mcp")throw new OAuthError("invalid_target");observe?.("RESOURCE_VALIDATION","PASS");return {clientId,redirectUri,codeChallenge:q.get("code_challenge"),state:q.get("state"),scope:"handoff:create",resource:q.get("resource")}}
export async function authorizeMcpUser(userId,q){const p=await validateAuthorization(q);const result=new URL(p.redirectUri);result.searchParams.set("code","synthetic-code");result.searchParams.set("state",p.state);result.searchParams.set("iss",MCP_ISSUER);globalThis.authorization={userId,...p};return result.toString()}`,
};
const bundled=await build({entryPoints:[path.join(root,"app/oauth/authorize/route.ts")],bundle:true,platform:"node",format:"esm",write:false,
 plugins:[{name:"test-dependencies",setup(plugin){plugin.onResolve({filter:/^@\/lib\//},arg=>fake[arg.path]?{path:arg.path,namespace:"mock"}:{path:path.join(root,`${arg.path.slice(2)}.ts`)});plugin.onResolve({filter:/^\.\/mcp-oauth$/},()=>({path:"@/lib/mcp-oauth",namespace:"mock"}));plugin.onLoad({filter:/.*/,namespace:"mock"},arg=>({contents:fake[arg.path],loader:"js"}));}}]});
const {GET,POST}=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
const diagnosticLines=[];
const previousInfo=console.info;
console.info=(line)=>diagnosticLines.push(String(line));
const origin="https://big-baby.example";
const query=new URLSearchParams({response_type:"code",client_id:"registered",redirect_uri:"https://chatgpt.com/connector_platform_oauth_redirect",scope:"handoff:create",state:"synthetic-state",code_challenge:"B".repeat(43),code_challenge_method:"S256",resource:`${origin}/api/mcp`});
const consent=await GET(new Request(`${origin}/oauth/authorize?${query}`,{headers:{cookie:"user-A"}}));
assert.equal(consent.status,200);
const steps=diagnosticLines.map(line=>JSON.parse(line));
for(const stage of ["QUERY_PARSE","CLIENT_LOOKUP","REDIRECT_URI_VALIDATION","RESPONSE_TYPE_VALIDATION","PKCE_VALIDATION","STATE_VALIDATION","SCOPE_VALIDATION","RESOURCE_VALIDATION","USER_LOOKUP","TRANSACTION_CREATE","TRANSACTION_ENCRYPT","CONSENT_RENDER"]){
 assert.ok(steps.some(entry=>entry.step===stage&&entry.status==="START"),`${stage} started`);
 assert.ok(steps.some(entry=>entry.step===stage&&entry.status==="PASS"),`${stage} passed`);
}
assert.ok(steps.every(entry=>entry.request_id===steps[0].request_id));
assert.ok(steps.some(entry=>entry.step==="TRANSACTION_ENCRYPT"&&entry.config_present===true));
for(const failureStep of ["CLIENT_LOOKUP","USER_LOOKUP","TRANSACTION_ENCRYPT"]){
 globalThis.oauthDiagnosticFailure=failureStep;
 const failed=await GET(new Request(`${origin}/oauth/authorize?${query}`,{headers:{cookie:"user-A"}}));
 assert.equal(failed.status,503);
 assert.deepEqual(JSON.parse(await failed.text()),{error:"server_error"});
 const last=JSON.parse(diagnosticLines.at(-1));
 assert.equal(last.step,failureStep);assert.equal(last.status,"FAIL");assert.equal(last.error_class,"Error");
}
globalThis.oauthDiagnosticFailure=undefined;
console.info=previousInfo;
const logged=diagnosticLines.join("\n");
for(const sensitive of ["synthetic-state","B".repeat(43),"user-A","synthetic client lookup failure","synthetic user lookup failure","synthetic encryption failure","registered","connector_platform_oauth_redirect"]){
 assert.equal(logged.includes(sensitive),false,"diagnostics must not contain authorization, cookie, or exception values");
}
const html=await consent.text();
assert.match(html,/同意连接/);
const hidden=html.match(/<input type="hidden" name="transaction" value="([^"]+)">/);
assert.ok(hidden,"consent form contains sealed transaction");
assert.doesNotMatch(html,/name="(?:client_id|redirect_uri|code_challenge|state)"/);
function submit(consentValue,body={transaction:hidden[1]},{originHeader="null",fetchSite="same-origin",cookie="user-A"}={}){
 const headers={"content-type":"application/x-www-form-urlencoded",cookie,"sec-fetch-site":fetchSite,"sec-fetch-mode":"navigate","sec-fetch-dest":"document"};
 if(originHeader!==undefined)headers.origin=originHeader;
 return POST(new Request(`${origin}/oauth/authorize`,{method:"POST",headers,body:new URLSearchParams({...body,consent:consentValue})}));
}
const approval=await submit("yes");assert.equal(approval.status,303);
const callback=new URL(approval.headers.get("location"));
assert.equal(callback.origin,"https://chatgpt.com");assert.equal(callback.pathname,"/connector_platform_oauth_redirect");
assert.equal(callback.searchParams.get("state"),"synthetic-state");assert.ok(callback.searchParams.has("code"));
assert.equal(globalThis.authorization.userId,"user-A");assert.equal(globalThis.authorization.codeChallenge,"B".repeat(43));
assert.equal(globalThis.authorization.scope,"handoff:create");assert.equal(globalThis.authorization.resource,`${origin}/api/mcp`);
const denied=await submit("no");assert.equal(denied.status,303);
const denyCallback=new URL(denied.headers.get("location"));assert.equal(denyCallback.searchParams.get("error"),"access_denied");assert.equal(denyCallback.searchParams.get("state"),"synthetic-state");assert.equal(denyCallback.searchParams.has("code"),false);
assert.equal((await submit("yes",{transaction:hidden[1],client_id:"other",redirect_uri:"https://evil.example",code_challenge:"Z".repeat(43)})).status,303,"untrusted POST parameters are ignored");
assert.equal(globalThis.authorization.codeChallenge,"B".repeat(43));
assert.equal((await submit("yes",{transaction:"forged"})).status,400);
assert.equal((await submit("yes",{transaction:hidden[1]},{cookie:"user-B"})).status,400);
assert.equal((await submit("yes",{transaction:hidden[1]},{originHeader:"null",fetchSite:"cross-site"})).status,403);
assert.equal((await submit("yes",{transaction:hidden[1]},{originHeader:"https://evil.example"})).status,403);
assert.equal((await submit("yes",{transaction:hidden[1]},{originHeader:origin})).status,303);
console.log("OAuth GET → consent POST approve/deny regression: PASS (sealed fields, sandbox origin, redirects, isolation)");
