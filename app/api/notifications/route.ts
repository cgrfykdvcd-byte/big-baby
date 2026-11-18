import { requireUser } from "@/lib/auth";
import { listNotifications } from "@/lib/notification-service";
import { failure, reply } from "@/lib/security";
export const dynamic="force-dynamic";
export async function GET(request:Request){try{const user=await requireUser(request);return reply({notifications:await listNotifications(user.userId),availability:{web:"available",wecom:"verified_identity_required",push:"future",sms:"future"}});}catch(error){return failure(error)}}
