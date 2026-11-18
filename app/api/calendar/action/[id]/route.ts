import { requireUser } from "@/lib/auth";
import { generateActionIcs } from "@/lib/calendar-runtime";
import { failure, reply } from "@/lib/security";
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{const user=await requireUser(request),{id}=await params,result=await generateActionIcs(user.userId,id);return reply(result.eligible?{action:result.action,eligible:true}:{action:result.action,eligible:false,reason:result.reason});}catch(error){return failure(error)}}
