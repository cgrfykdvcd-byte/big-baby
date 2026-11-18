import { exchangeMcpToken } from "@/lib/mcp-oauth";
import { boundedForm, oauthFailure, oauthJson } from "@/lib/mcp-oauth-http";
export async function POST(request:Request){try{return oauthJson(await exchangeMcpToken(await boundedForm(request)))}
catch(error){return oauthFailure(error)}}
