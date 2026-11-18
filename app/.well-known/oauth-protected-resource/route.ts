import { MCP_ISSUER, MCP_RESOURCE, MCP_SCOPE } from "@/lib/mcp-oauth";
export function GET(){return Response.json({resource:MCP_RESOURCE,authorization_servers:[MCP_ISSUER],scopes_supported:[MCP_SCOPE]},{headers:{"Cache-Control":"public, max-age=300"}});}
