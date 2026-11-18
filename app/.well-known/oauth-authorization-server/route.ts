import { MCP_ISSUER, MCP_SCOPE } from "@/lib/mcp-oauth";
export function GET(){return Response.json({
 issuer:MCP_ISSUER,authorization_endpoint:`${MCP_ISSUER}/oauth/authorize`,token_endpoint:`${MCP_ISSUER}/oauth/token`,
 registration_endpoint:`${MCP_ISSUER}/oauth/register`,revocation_endpoint:`${MCP_ISSUER}/oauth/revoke`,
 response_types_supported:["code"],grant_types_supported:["authorization_code","refresh_token"],
 code_challenge_methods_supported:["S256"],token_endpoint_auth_methods_supported:["none"],
 scopes_supported:[MCP_SCOPE],authorization_response_iss_parameter_supported:true,
},{headers:{"Cache-Control":"public, max-age=300"}});}
