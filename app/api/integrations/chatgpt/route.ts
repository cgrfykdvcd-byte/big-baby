import { requireUser } from "@/lib/auth";
import { createChatGptCredential, listChatGptCredentials, revokeChatGptCredential } from "@/lib/chatgpt-handoff";
import { assertWrite, failure, HttpError, limitedJson, reply, throttle } from "@/lib/security";
import { z } from "zod";

export const dynamic="force-dynamic";
const bodySchema=z.discriminatedUnion("action",[
 z.object({action:z.literal("create_credential")}),
 z.object({action:z.literal("revoke_credential"),credential_id:z.string().uuid()}),
]);

export async function GET(request:Request){try{
 const user=await requireUser(request);
 return reply({credentials:await listChatGptCredentials(user.userId)});
}catch(error){return failure(error)}}

export async function POST(request:Request){try{
 assertWrite(request);const user=await requireUser(request);await throttle(`chatgpt-credentials:${user.userId}`,10,3600);
 const data=bodySchema.parse(await limitedJson(request,8000));
 if(data.action==="create_credential"){
  const created=await createChatGptCredential(user.userId);
  return reply({credential:created.credential,access_token:created.access_token},201);
 }
 if(data.action==="revoke_credential"){await revokeChatGptCredential(user.userId,data.credential_id);return reply({ok:true});}
 throw new HttpError("不支持此操作。");
}catch(error){if(error instanceof z.ZodError)return reply({error:error.issues[0]?.message||"请求无效。"},400);return failure(error)}}
