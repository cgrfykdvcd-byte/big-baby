import { requireUser } from "@/lib/auth";
import { notificationPreferences, updateNotificationPreferences } from "@/lib/notification-service";
import { assertWrite, failure, limitedJson, reply } from "@/lib/security";

export const dynamic="force-dynamic";
const clocks=(value:unknown)=>typeof value==="string"&&(!value||/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value));
const booleans=["web_enabled","wecom_enabled","push_enabled","sms_enabled","calendar_enabled","critical_sms_enabled","deadline_1d_enabled","deadline_2h_enabled"] as const;

export async function GET(request:Request){try{const user=await requireUser(request),preferences=await notificationPreferences(user.userId);return reply({preferences,availability:{web:"available",wecom:preferences.wecom_enabled?"configured_or_identity_required":"disabled",push:"future",sms:"future"}});}catch(error){return failure(error)}}
export async function POST(request:Request){try{assertWrite(request);const user=await requireUser(request),data=await limitedJson(request,10_000) as Record<string,unknown>,patch:Record<string,unknown>={};for(const key of booleans)if(typeof data[key]==="boolean")patch[key]=data[key];for(const key of ["quiet_hours_start","quiet_hours_end"] as const)if(data[key]!==undefined){if(!clocks(data[key]))throw new Error("invalid_quiet_hours");patch[key]=data[key];}return reply({preferences:await updateNotificationPreferences(user.userId,patch)});}catch(error){return failure(error)}}
