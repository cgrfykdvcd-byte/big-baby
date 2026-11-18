import { OAuthError } from "./mcp-oauth";
import { trustedConsentOrigin } from "./mcp-consent-origin";

export function oauthJson(value:unknown,status=200){
 return Response.json(value,{status,headers:{"Cache-Control":"no-store","Pragma":"no-cache","X-Content-Type-Options":"nosniff"}});
}
export function oauthFailure(error:unknown){
 if(error instanceof OAuthError)return oauthJson({error:error.code},error.status);
 console.error("MCP OAuth operation failed",error instanceof Error?error.name:"unknown");
 return oauthJson({error:"server_error"},503);
}
export async function boundedForm(request:Request,max=8192){
 if(!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded"))throw new OAuthError("invalid_request");
 const text=await request.text();if(text.length>max)throw new OAuthError("invalid_request");
 return new URLSearchParams(text);
}
export function requireSameOrigin(request:Request,origin:string){
 if(!trustedConsentOrigin(request,origin))throw new OAuthError("invalid_request",403);
}
