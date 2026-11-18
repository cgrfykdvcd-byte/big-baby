import { authenticateChatGptCredential, HANDOFF_CATEGORIES, handoffFromChatGpt } from "@/lib/chatgpt-handoff";
import { failure, HttpError, limitedJson, reply, throttle } from "@/lib/security";
import { z } from "zod";

export const dynamic="force-dynamic";
const metadataValue=z.union([z.string().max(1024),z.number().finite(),z.boolean(),z.null()]);
const handoffSchema=z.object({
 original_text:z.string().trim().min(2).max(100000),
 explicit_intent:z.boolean().default(false),
 category:z.enum(HANDOFF_CATEGORIES).optional(),
 title:z.string().trim().max(240).optional(),
 deadline:z.string().trim().max(64).optional(),
 location:z.string().trim().max(240).optional(),
 materials:z.array(z.string().trim().min(1).max(240)).max(24).optional(),
 source_reference:z.string().trim().max(512).optional(),
 request_id:z.string().trim().min(1).max(160).optional(),
 metadata:z.record(z.string().min(1).max(80),metadataValue).refine(value=>Object.keys(value).length<=32,"metadata 字段过多。").optional(),
});
const bearer=(request:Request)=>request.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]||"";

export async function POST(request:Request){try{
 const credential=await authenticateChatGptCredential(bearer(request));
 await throttle(`chatgpt-handoff:${credential.id}`,120,3600);
 const data=handoffSchema.parse(await limitedJson(request,120000));
 const requestId=request.headers.get("idempotency-key")?.trim()||data.request_id||"";
 if(!requestId||requestId.length>160)throw new HttpError("必须提供有效的 Idempotency-Key。",400);
 const handoff=await handoffFromChatGpt(credential,data,requestId);
 return reply({ok:true,duplicate:handoff.duplicate,processing:handoff.processing,...handoff.result});
}catch(error){if(error instanceof z.ZodError)return reply({error:error.issues[0]?.message||"请求无效。"},400);return failure(error)}}
