import { requireUser } from "@/lib/auth";
import { failure, reply } from "@/lib/security";
import { listWeComPendingMappings } from "@/lib/wecom-identity";

export const dynamic="force-dynamic";
export async function GET(request:Request){try{const user=await requireUser(request);return reply({pending_mappings:await listWeComPendingMappings(user.userId)});}catch(error){return failure(error)}}
