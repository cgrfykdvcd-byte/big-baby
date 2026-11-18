import { handleMcpRequest, validMcpOrigin } from "@/lib/mcp-transport";
export const dynamic="force-dynamic";
export async function POST(request:Request){try{return await handleMcpRequest(request)}
catch(error){console.error("MCP request failed",error instanceof Error?error.name:"unknown");
 return Response.json({jsonrpc:"2.0",id:null,error:{code:-32603,message:"Internal error"}},{status:503,headers:{"Cache-Control":"no-store"}})}}
export function GET(request:Request){return new Response(null,{status:validMcpOrigin(request)?405:403,headers:{"Allow":"POST"}})}
export function DELETE(request:Request){return GET(request)}
