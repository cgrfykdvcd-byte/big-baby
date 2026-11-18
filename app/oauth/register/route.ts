import { registerMcpClient } from "@/lib/mcp-oauth";
import { oauthFailure, oauthJson } from "@/lib/mcp-oauth-http";
export async function POST(request:Request){try{
 if(!request.headers.get("content-type")?.startsWith("application/json"))return oauthJson({error:"invalid_client_metadata"},400);
 const raw=await request.text();if(raw.length>8192)return oauthJson({error:"invalid_client_metadata"},400);
 let data:unknown;try{data=JSON.parse(raw)}catch{return oauthJson({error:"invalid_client_metadata"},400)}
 return oauthJson(await registerMcpClient(request,data),201);
}catch(error){return oauthFailure(error)}}
