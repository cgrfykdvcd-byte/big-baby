import { requireUser } from "@/lib/auth";
import { failure, limitedJson, reply, assertWrite } from "@/lib/security";
import { listWeComIdentities, unlinkWeComIdentity } from "@/lib/wecom-identity";

export const dynamic="force-dynamic";

export async function GET(request:Request){try{const user=await requireUser(request);return reply({identities:await listWeComIdentities(user.userId)});}catch(error){return failure(error)}}
export async function POST(request:Request){try{assertWrite(request);const user=await requireUser(request),body=await limitedJson(request,8_000) as {action?:unknown;identity_id?:unknown};if(body.action!=="unlink"||typeof body.identity_id!=="string")throw new Error("invalid_identity_action");return reply({identity:await unlinkWeComIdentity(user.userId,body.identity_id)});}catch(error){return failure(error)}}
