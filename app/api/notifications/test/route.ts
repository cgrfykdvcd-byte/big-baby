import { requireUser } from "@/lib/auth";
import { sendTestNotification } from "@/lib/notification-service";
import { assertWrite, failure, limitedJson, reply, throttle } from "@/lib/security";
import type { NotificationChannel } from "@/lib/notification";
export const dynamic="force-dynamic";
const channels=new Set<NotificationChannel>(["web","wecom","push","sms"]);
export async function POST(request:Request){try{assertWrite(request);const user=await requireUser(request),data=await limitedJson(request,10_000) as {channel?:NotificationChannel};if(!data.channel||!channels.has(data.channel))throw new Error("invalid_notification_channel");await throttle(`notification-test:${user.userId}`,8,3600);return reply(await sendTestNotification(user.userId,data.channel));}catch(error){return failure(error)}}
