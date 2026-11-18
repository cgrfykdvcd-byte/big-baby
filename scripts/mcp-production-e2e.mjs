import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";

// Creates isolated test accounts and revokes every credential it creates.
// It never prints account passwords, OAuth codes, or bearer tokens.
const origin="https://juying-campus-rosie.lzh2907846213.chatgpt.site";
const nonce=randomBytes(8).toString("hex");
const resource=`${origin}/api/mcp`;
const redirectUri="https://chatgpt.com/connector/oauth/test_callback";
const verifier=randomBytes(48).toString("base64url");
const challenge=createHash("sha256").update(verifier).digest("base64url");
const assertStatus=(response,status,label)=>assert.equal(response.status,status,`${label}: HTTP ${response.status}`);
const json=async(path,init={})=>{
 const response=await fetch(origin+path,{redirect:"manual",...init});
 let body=null;try{body=await response.json()}catch{}
 return {response,body};
};
async function account(suffix){
 const registered=await json("/api/auth",{method:"POST",headers:{"content-type":"application/json","x-campus-action":"1",origin},
  body:JSON.stringify({action:"register",username:`mcp_e2e_${suffix}_${nonce}`,password:`T!_${randomBytes(30).toString("base64url")}`,name:`MCP test ${suffix}`})});
 assertStatus(registered.response,200,"register");
 const cookie=registered.response.headers.get("set-cookie")?.split(";",1)[0];
 assert.ok(cookie);
 return cookie;
}
const mcpRequest=async(method,id,params={},token="",version="2025-11-25")=>json("/api/mcp",{method:"POST",headers:{
 "content-type":"application/json","accept":"application/json, text/event-stream","mcp-protocol-version":version,
 ...(token?{authorization:`Bearer ${token}`}:{}),
 ...(version==="2026-07-28"?{"mcp-method":method,...(method==="tools/call"?{"mcp-name":String(params.name)}:{})}:{}),
},body:JSON.stringify({jsonrpc:"2.0",id,method,params:version==="2026-07-28"?{...params,_meta:{"io.modelcontextprotocol/protocolVersion":version,"io.modelcontextprotocol/clientInfo":{name:"Big Baby E2E",version:"1"},"io.modelcontextprotocol/clientCapabilities":{}}}:params})});

const prm=await json("/.well-known/oauth-protected-resource");
const as=await json("/.well-known/oauth-authorization-server");
assertStatus(prm.response,200,"protected metadata");assertStatus(as.response,200,"authorization metadata");
assert.equal(prm.body.resource,resource);
assert.ok(as.body.code_challenge_methods_supported.includes("S256"));
const init=await mcpRequest("initialize",1,{protocolVersion:"2025-11-25"});
assertStatus(init.response,200,"MCP initialize");
const discovered=await mcpRequest("tools/list",2,{});
assertStatus(discovered.response,200,"MCP tool discovery");
assert.deepEqual(discovered.body.result.tools.map(tool=>tool.name),["add_to_big_baby"]);
const tool=discovered.body.result.tools[0];
assert.equal(tool.annotations.readOnlyHint,false);
assert.deepEqual(tool.securitySchemes,[{type:"oauth2",scopes:["handoff:create"]}]);
const latest=await mcpRequest("tools/list",3,{},undefined,"2026-07-28");
assertStatus(latest.response,200,"2026-07-28 MCP headers");

const exactArgs={text:"加入巨婴系统：\n2026-09-18 17:00 前完成概率论作业。",explicit_intent:true,category_hint:"assignment"};
const noAuth=await mcpRequest("tools/call",4,{name:"add_to_big_baby",arguments:exactArgs});
assertStatus(noAuth.response,401,"unauthenticated tool");
assert.ok(noAuth.response.headers.get("www-authenticate")?.includes("resource_metadata"));
const cookieA=await account("a"),cookieB=await account("b");
const client=await json("/oauth/register",{method:"POST",headers:{"content-type":"application/json"},
 body:JSON.stringify({client_name:"Big Baby test",redirect_uris:[redirectUri],grant_types:["authorization_code","refresh_token"],response_types:["code"],token_endpoint_auth_method:"none"})});
assertStatus(client.response,201,"DCR registration");
const auth=new URLSearchParams({client_id:client.body.client_id,redirect_uri:redirectUri,response_type:"code",scope:"handoff:create",resource,code_challenge:challenge,code_challenge_method:"S256",state:`state-${nonce}`});
const consent=await fetch(`${origin}/oauth/authorize?${auth}`,{headers:{cookie:cookieA}});
assertStatus(consent,200,"OAuth consent page");
assert.ok((await consent.text()).includes("同意连接"));
const issued=await fetch(`${origin}/oauth/authorize`,{method:"POST",redirect:"manual",
 headers:{"content-type":"application/x-www-form-urlencoded",origin,cookie:cookieA},
 body:new URLSearchParams({...Object.fromEntries(auth),consent:"yes"})});
assertStatus(issued,303,"OAuth authorize");
const callback=new URL(issued.headers.get("location"));
assert.equal(callback.origin,"https://chatgpt.com");
assert.equal(callback.searchParams.get("iss"),origin);
assert.equal(callback.searchParams.get("state"),`state-${nonce}`);
const token=await json("/oauth/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},
 body:new URLSearchParams({grant_type:"authorization_code",client_id:client.body.client_id,redirect_uri:redirectUri,
 code:callback.searchParams.get("code"),code_verifier:verifier,resource})});
assertStatus(token.response,200,"OAuth token");
assert.equal(token.body.scope,"handoff:create");
const replay=await json("/oauth/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},
 body:new URLSearchParams({grant_type:"authorization_code",client_id:client.body.client_id,redirect_uri:redirectUri,
 code:callback.searchParams.get("code"),code_verifier:verifier,resource})});
assertStatus(replay.response,400,"one-use code");
const access=token.body.access_token;
const inbox=async(cookie)=>(await json("/api/inbox",{headers:{cookie}})).body.items;
const events=async(cookie)=>(await json("/api/events",{headers:{cookie}})).body.events;
const beforeB=(await inbox(cookieB)).length;
const exact=await mcpRequest("tools/call",10,{name:"add_to_big_baby",arguments:exactArgs},access);
assertStatus(exact.response,200,"exact handoff");
assert.equal(exact.body.result.structuredContent.decision,"AUTO_CANDIDATE");
assert.equal(exact.body.result.structuredContent.candidate_action_ids.length,1);
const exactEvent=(await events(cookieA)).find(event=>event.id===exact.body.result.structuredContent.event_id);
assert.equal(exactEvent.actions.find(action=>action.id===exact.body.result.structuredContent.candidate_action_ids[0]).deadline,"2026-09-18T17:00");
assert.equal(exactEvent.evidence[0].source_type,"chatgpt");
assert.equal((await inbox(cookieB)).length,beforeB,"A's token must not write B's inbox");
const afterExact=(await inbox(cookieA)).length;
const duplicate=await mcpRequest("tools/call",11,{name:"add_to_big_baby",arguments:exactArgs},access);
assert.equal(duplicate.body.result.structuredContent.duplicate,true);
assert.equal((await inbox(cookieA)).length,afterExact);
const vague=await mcpRequest("tools/call",12,{name:"add_to_big_baby",arguments:{
 text:"加入巨婴系统：周五完成概率论作业。",explicit_intent:true,category_hint:"assignment",
}},access);
assert.equal(vague.body.result.structuredContent.decision,"NEEDS_REVIEW");
assert.ok(vague.body.result.structuredContent.review_reasons.includes("deadline_confidence_below_threshold"));
const rejectedInput=await mcpRequest("tools/call",13,{name:"add_to_big_baby",arguments:{...exactArgs,user_id:"victim"}},access);
assert.equal(rejectedInput.body.error.code,-32602);
const beforeRevoke={a:(await inbox(cookieA)).length,b:(await inbox(cookieB)).length,events:(await events(cookieA)).length};
const revoke=await fetch(`${origin}/oauth/revoke`,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},
 body:new URLSearchParams({token:access,client_id:client.body.client_id})});
assertStatus(revoke,200,"revoke");
const blocked=await mcpRequest("tools/call",14,{name:"add_to_big_baby",arguments:{text:"加入巨婴系统：提交撤销后的测试材料",explicit_intent:true}},access);
assertStatus(blocked.response,401,"revoked access");
assert.deepEqual({a:(await inbox(cookieA)).length,b:(await inbox(cookieB)).length,events:(await events(cookieA)).length},beforeRevoke);
const blockedRefresh=await json("/oauth/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},
 body:new URLSearchParams({grant_type:"refresh_token",client_id:client.body.client_id,refresh_token:token.body.refresh_token,resource})});
assertStatus(blockedRefresh.response,400,"revoked refresh");

// The old handoff contract remains operational with its own opaque credential.
const oldCredential=await json("/api/integrations/chatgpt",{method:"POST",headers:{"content-type":"application/json","x-campus-action":"1",origin,cookie:cookieA},body:JSON.stringify({action:"create_credential"})});
assertStatus(oldCredential.response,201,"legacy credential create");
const legacy=await json("/api/integrations/chatgpt/handoff",{method:"POST",
 headers:{"content-type":"application/json",authorization:`Bearer ${oldCredential.body.access_token}`,"idempotency-key":`legacy-${nonce}`},
 body:JSON.stringify({original_text:"加入巨婴系统：9月25日前提交比赛报名表。",explicit_intent:true,category:"competition"})});
assertStatus(legacy.response,200,"legacy handoff API");
assert.ok(legacy.body.event_id);
const oldRevoke=await json("/api/integrations/chatgpt",{method:"POST",headers:{"content-type":"application/json","x-campus-action":"1",origin,cookie:cookieA},body:JSON.stringify({action:"revoke_credential",credential_id:oldCredential.body.credential.id})});
assertStatus(oldRevoke.response,200,"legacy credential revoke");
console.log(JSON.stringify({mcp:"PASS",discovery:"PASS",pkce:"PASS",exact:exact.body.result.structuredContent.decision,ambiguous:vague.body.result.structuredContent.decision,idempotency:"PASS",isolation:"PASS",revocation:"PASS",legacyHandoff:"PASS"}));
