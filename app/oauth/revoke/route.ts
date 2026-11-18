import { revokeMcpToken } from "@/lib/mcp-oauth";
import { boundedForm, oauthFailure } from "@/lib/mcp-oauth-http";
export async function POST(request:Request){try{
 const form=await boundedForm(request);
 await revokeMcpToken(form.get("token")||"",form.get("client_id")||"");
 return new Response(null,{status:200,headers:{"Cache-Control":"no-store"}});
}catch(error){return oauthFailure(error)}}
