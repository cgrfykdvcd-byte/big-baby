import { requireUser } from "@/lib/auth";
import { assertWrite, failure, reply, throttle } from "@/lib/security";
import { startWeComBinding } from "@/lib/wecom-identity";

export const dynamic="force-dynamic";
export async function POST(request:Request){try{assertWrite(request);const user=await requireUser(request);await throttle(`wecom-bind:${user.userId}`,6,900);return reply({binding:await startWeComBinding(user.userId)});}catch(error){return failure(error)}}
