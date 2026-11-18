import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { allowedRedirect, hasRequiredScope, pkceS256, tokenIsUsable } from "../lib/mcp-oauth-policy.ts";

assert.equal(allowedRedirect("https://chatgpt.com/connector/oauth/test_callback"),true);
assert.equal(allowedRedirect("https://chatgpt.com/connector_platform_oauth_redirect"),true);
for(const redirect of ["https://example.com/connector/oauth/test_callback","https://chatgpt.com.evil.test/connector/oauth/test_callback","https://chatgpt.com/connector/oauth/test_callback?next=https://evil.test","http://chatgpt.com/connector/oauth/test_callback"]){
 assert.equal(allowedRedirect(redirect),false);
}
assert.equal(await pkceS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),"E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
const good={kind:"access",revokedAt:null,expiresAt:2000,resource:"https://bigbaby.test/mcp"};
assert.equal(tokenIsUsable(good,good.resource,1000),true);
assert.equal(tokenIsUsable(good,good.resource,2000),false,"expired tokens are rejected at the boundary");
assert.equal(tokenIsUsable({...good,revokedAt:"now"},good.resource,1000),false);
assert.equal(tokenIsUsable({...good,kind:"refresh"},good.resource,1000),false);
assert.equal(tokenIsUsable(good,"https://other.test/mcp",1000),false);
assert.equal(hasRequiredScope("handoff:create","handoff:create"),true);
assert.equal(hasRequiredScope("events:read","handoff:create"),false,"insufficient scope is rejected");
assert.equal(hasRequiredScope("other handoff:create","handoff:create"),true);

const root=new URL("../",import.meta.url);
const read=(path:string)=>readFile(new URL(path,root),"utf8");
const [transport,oauth,handoff,engine,route,schema,migration]=await Promise.all([
 read("lib/mcp-transport.ts"),read("lib/mcp-oauth.ts"),read("lib/chatgpt-handoff.ts"),
 read("lib/event-engine-runtime.ts"),read("app/mcp/route.ts"),read("db/schema.ts"),read("drizzle/0010_fancy_living_mummy.sql"),
]);
assert.match(transport,/handoffFromChatGpt\(/);
assert.match(transport,/validateMcpAccessToken\(bearer\)/);
assert.match(transport,/MCP_SCOPE/);
assert.match(transport,/\.strict\(\)/);
assert.match(transport,/additionalProperties:false/);
assert.match(transport,/idempotentHint:true/);
assert.equal((transport.match(/name:"add_to_big_baby"/g)||[]).length,1);
assert.equal(transport.includes("entryUpsert"),false);
assert.equal(transport.includes("INSERT INTO entries"),false);
assert.equal(handoff.includes("importMessages(credential.userId,input.original_text"),true);
assert.equal(oauth.includes("row.codeChallenge!==await pkceS256(verifier)"),true);
assert.equal(oauth.includes("consumed.meta.changes!==1"),true);
assert.equal(oauth.includes("tokenIsUsable(token,MCP_RESOURCE,now())"),true);
assert.equal(oauth.includes("scope:token.scope"),true);
assert.equal(route.includes("handleMcpRequest"),true);
for(const table of ["mcp_oauth_clients","mcp_oauth_codes","mcp_oauth_tokens"]){
 assert.equal(schema.includes(table)&&migration.includes(table),true,table);
}
assert.equal(engine.includes("mcp"),false,"Event Engine is source-agnostic");
console.log("MCP policy and contract tests: PASS (20 checks)");
