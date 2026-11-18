import { z } from "zod";
import { handoffFromChatGpt, HANDOFF_CATEGORIES } from "./chatgpt-handoff";
import { digest } from "./security";
import { MCP_ISSUER, MCP_SCOPE, validateMcpAccessToken } from "./mcp-oauth";
import { hasRequiredScope } from "./mcp-oauth-policy";

const PROTOCOL="2025-11-25";
const CURRENT_PROTOCOL="2026-07-28";
const SUPPORTED=[CURRENT_PROTOCOL,PROTOCOL,"2025-06-18","2025-03-26"];
export const ADD_TOOL={
 name:"add_to_big_baby",
 title:"Add to Big Baby",
 description:"Only when the user explicitly asks to add a specific item to Big Baby. Sends only the selected text; the system may require review and never directly creates a final task.",
 inputSchema:{type:"object",properties:{
  text:{type:"string",minLength:2,maxLength:100000,description:"Only the text the user explicitly wants to hand off, not a complete conversation."},
  explicit_intent:{type:"boolean",description:"Whether the user explicitly directed this content to Big Baby."},
  category_hint:{type:"string",enum:[...HANDOFF_CATEGORIES],description:"Optional category hint, not a final classification."},
  source_reference:{type:"string",maxLength:512,description:"Optional non-sensitive source reference; not a user identity."},
 },required:["text","explicit_intent"],additionalProperties:false},
 annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
 securitySchemes:[{type:"oauth2",scopes:[MCP_SCOPE]}],
} as const;
const input=z.object({
 text:z.string().trim().min(2).max(100000),explicit_intent:z.boolean(),
 category_hint:z.enum(HANDOFF_CATEGORIES).optional(),source_reference:z.string().trim().max(512).optional(),
}).strict();
type Rpc={jsonrpc?:unknown;id?:unknown;method?:unknown;params?:unknown};
const rpc=(id:unknown,result:unknown,status=200,headers:Record<string,string>={})=>
 Response.json({jsonrpc:"2.0",id,result},{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff",...headers}});
const error=(id:unknown,code:number,message:string,status=200,headers:Record<string,string>={})=>
 Response.json({jsonrpc:"2.0",id,error:{code,message}},{status,headers:{"Cache-Control":"no-store",...headers}});
export const challenge=(code="invalid_token")=>`Bearer resource_metadata="${MCP_ISSUER}/.well-known/oauth-protected-resource", scope="${MCP_SCOPE}", error="${code}", error_description="Big Baby authorization required"`;
const unavailable=(id:unknown,scope=false)=>rpc(id,{
 content:[{type:"text",text:"请先授权 Big Baby 连接，再重试此操作。"}],
 isError:true,_meta:{"mcp/www_authenticate":[challenge(scope?"insufficient_scope":"invalid_token")]},
},401,{"WWW-Authenticate":challenge(scope?"insufficient_scope":"invalid_token")});
const decisionText=(decision:string|null)=>{
 if(decision==="AUTO_CANDIDATE")return "已发送到巨婴系统并创建待办候选，仍需确认。";
 if(decision==="NEEDS_REVIEW")return "已发送到巨婴系统，但部分信息需要确认。";
 return "已记录到巨婴系统，但当前未形成用户待办。";
};
export function validMcpOrigin(request:Request){
 const origin=request.headers.get("origin");
 return !origin||origin===MCP_ISSUER||origin==="https://chatgpt.com";
}
export async function handleMcpRequest(request:Request){
 if(!validMcpOrigin(request))return error(null,-32600,"Invalid origin",403);
 const accept=request.headers.get("accept")||"";
 if(!accept.includes("application/json")||!accept.includes("text/event-stream"))return error(null,-32600,"Accept must include application/json and text/event-stream",406);
 if(!request.headers.get("content-type")?.startsWith("application/json"))return error(null,-32600,"Expected application/json",415);
 const raw=await request.text();
 if(raw.length>120000)return error(null,-32600,"Request too large",413);
 let message:Rpc;
 try{message=JSON.parse(raw)}catch{return error(null,-32700,"Parse error",400)}
 if(!message||typeof message!=="object"||Array.isArray(message)||message.jsonrpc!=="2.0"||typeof message.method!=="string"||
   (message.id!==undefined&&typeof message.id!=="string"&&typeof message.id!=="number"))return error(null,-32600,"Invalid Request",400);
 const notification=message.id===undefined,id=message.id??null;
 const version=request.headers.get("mcp-protocol-version")||"2025-03-26";
 if(!SUPPORTED.includes(version))return error(id,-32600,`Unsupported protocol version; supported: ${SUPPORTED.join(", ")}`,400);
 if(version===CURRENT_PROTOCOL){
  const params=message.params&&typeof message.params==="object"?message.params as Record<string,unknown>:{};
  const meta=params._meta&&typeof params._meta==="object"?params._meta as Record<string,unknown>:{};
  if(meta["io.modelcontextprotocol/protocolVersion"]!==version||request.headers.get("mcp-method")!==message.method||
   (message.method==="tools/call"&&request.headers.get("mcp-name")!==params.name))return error(id,-32600,"HeaderMismatch",400);
 }
 if(notification){
  if(message.method==="notifications/initialized"||message.method==="notifications/cancelled")return new Response(null,{status:202});
  return error(null,-32600,"Unsupported notification",400);
 }
 if(message.method==="initialize")return rpc(id,{protocolVersion:version,capabilities:{tools:{listChanged:false}},serverInfo:{name:"big-baby",version:"1.0.0"},instructions:"Only send content the user explicitly asks to add. Review decisions and deadlines are determined by Big Baby."});
 if(message.method==="ping")return rpc(id,{});
 if(message.method==="tools/list")return rpc(id,{tools:[ADD_TOOL]});
 if(message.method!=="tools/call")return error(id,-32601,"Method not found",404);
 const params=message.params&&typeof message.params==="object"?message.params as Record<string,unknown>:{};
 if(params.name!==ADD_TOOL.name)return error(id,-32602,"Unknown tool");
 const parsed=input.safeParse(params.arguments);
 if(!parsed.success)return error(id,-32602,"Invalid tool arguments");
 const bearer=request.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]||"";
 const identity=await validateMcpAccessToken(bearer);
 if(!identity)return unavailable(id);
 if(!hasRequiredScope(identity.scope,MCP_SCOPE))return unavailable(id,true);
 const args=parsed.data,requestId=`mcp:${await digest(JSON.stringify([args.text,args.explicit_intent,args.category_hint||null,args.source_reference||null]))}`;
 const handoff=await handoffFromChatGpt({
  id:identity.id,userId:identity.userId,status:identity.status,
  createdAt:"",revokedAt:null,lastUsedAt:null,
 },{
  original_text:args.text,explicit_intent:args.explicit_intent,category:args.category_hint,
  source_reference:args.source_reference,
 },requestId);
 const result=handoff.result;
 return rpc(id,{content:[{type:"text",text:decisionText(result.decision)}],structuredContent:{
  decision:result.decision,inbox_item_id:result.inbox_item_id,event_id:result.event_id,
  review_reasons:result.review_reasons,candidate_action_ids:result.candidate_action_ids,
  duplicate:handoff.duplicate,processing:handoff.processing,
 }});
}
