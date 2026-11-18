import { requireUser } from "@/lib/auth";
import { generateActionIcs } from "@/lib/calendar-runtime";
import { HttpError, failure } from "@/lib/security";
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{actionId:string}>}){try{const user=await requireUser(request),{actionId}=await params,result=await generateActionIcs(user.userId,actionId);if(!result.eligible)throw new HttpError("此行动当前不能生成日历。",409);return new Response(result.ics,{headers:{"Content-Type":"text/calendar; charset=utf-8","Content-Disposition":`attachment; filename*=UTF-8''${encodeURIComponent(`${result.action.title}.ics`)}`,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}catch(error){return failure(error)}}
