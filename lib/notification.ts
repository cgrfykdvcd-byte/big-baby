export const NOTIFICATION_CHANNELS=["web","wecom","push","sms"] as const;
export const NOTIFICATION_STATUSES=["scheduled","sent","failed","cancelled","suppressed"] as const;
export type NotificationChannel=(typeof NOTIFICATION_CHANNELS)[number];
export type NotificationStatus=(typeof NOTIFICATION_STATUSES)[number];
export type NotificationPriority="normal"|"critical";

export type NotificationPreference={
 user_id:string;web_enabled:boolean;wecom_enabled:boolean;push_enabled:boolean;sms_enabled:boolean;calendar_enabled:boolean;critical_sms_enabled:boolean;quiet_hours_start:string;quiet_hours_end:string;deadline_1d_enabled:boolean;deadline_2h_enabled:boolean;
};
export type NotificationPayload={action_title:string;deadline:string;location?:string|null;event_title:string;source_message_ids:string[];reminder_kind?:"deadline_1d"|"deadline_2h"|"test"};
export type ReminderPlan={channel:NotificationChannel;template_key:"deadline_1d"|"deadline_2h";scheduled_at:string;dedup_key:string;payload:NotificationPayload;priority:NotificationPriority};

const CHINA_OFFSET_MS=8*60*60*1000;
const clock=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const parseClock=(value:string)=>{if(!clock.test(value))return null;const [hour,minute]=value.split(":").map(Number);return hour*60+minute;};

// Event Engine stores canonical values; this conversion merely selects the MVP
// reminder instant for date-only deadlines in the current Mainland deployment.
export function deadlineInstant(deadline:string):Date|null{
 if(/^\d{4}-\d{2}-\d{2}$/.test(deadline))return new Date(`${deadline}T23:59:00+08:00`);
 if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(deadline))return new Date(`${deadline}:00+08:00`);
 const parsed=new Date(deadline);return Number.isNaN(parsed.getTime())?null:parsed;
}

export function deferForQuietHours(scheduledAt:Date,start:string,end:string):Date{
 const from=parseClock(start),until=parseClock(end);if(from===null||until===null||from===until)return scheduledAt;
 const local=new Date(scheduledAt.getTime()+CHINA_OFFSET_MS),minutes=local.getUTCHours()*60+local.getUTCMinutes();
 const inside=from<until?minutes>=from&&minutes<until:minutes>=from||minutes<until;
 if(!inside)return scheduledAt;
 let addDay=0;if(from>until&&minutes>=from)addDay=1;
 const target=new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()+addDay,Math.floor(until/60),until%60));
 return new Date(target.getTime()-CHINA_OFFSET_MS);
}

export function reminderDedupKey(actionId:string,channel:NotificationChannel,kind:"deadline_1d"|"deadline_2h",deadline:string){return `reminder:${actionId}:${channel}:${kind}:${deadline}`;}

export function planReminders(input:{action_id:string;event_title:string;action_title:string;deadline:string;location?:string|null;source_message_ids:string[];preferences:NotificationPreference}):ReminderPlan[]{
 const due=deadlineInstant(input.deadline);if(!due)return [];
 const channels:NotificationChannel[]=[];if(input.preferences.web_enabled)channels.push("web");if(input.preferences.wecom_enabled)channels.push("wecom");
 const kinds:Array<{kind:"deadline_1d"|"deadline_2h";enabled:boolean;offset:number}>=[{kind:"deadline_1d",enabled:input.preferences.deadline_1d_enabled,offset:24*60*60*1000},{kind:"deadline_2h",enabled:input.preferences.deadline_2h_enabled,offset:2*60*60*1000}];
 const plans:ReminderPlan[]=[];
 for(const item of kinds)if(item.enabled)for(const channel of channels){const base=new Date(due.getTime()-item.offset),deferred=deferForQuietHours(base,input.preferences.quiet_hours_start,input.preferences.quiet_hours_end);plans.push({channel,template_key:item.kind,scheduled_at:deferred.toISOString(),dedup_key:reminderDedupKey(input.action_id,channel,item.kind,input.deadline),payload:{action_title:input.action_title,event_title:input.event_title,deadline:input.deadline,location:input.location||null,source_message_ids:input.source_message_ids,reminder_kind:item.kind},priority:"normal"});}
 return plans;
}

export function renderNotificationTemplate(templateKey:string,payload:NotificationPayload,language:"zh-CN"|"en-US"="zh-CN"){
 if(templateKey==="test")return language==="en-US"?"Big Baby notification test.":"巨婴系统通知测试。";
 return language==="en-US"?`“${payload.action_title}” is due at ${payload.deadline}.`:`你的「${payload.action_title}」将在 ${payload.deadline} 截止。`;
}

export type WeComSendGateway={sendText(input:{corpId:string;secret:string;agentId:string;externalUserId:string;content:string}):Promise<{ok:boolean;messageId?:string;reason?:string}>};
export async function sendWeComProvider(input:{config:{corpId:string;secret:string;agentId:string};external_user_id?:string;template_key:string;payload:NotificationPayload;gateway:WeComSendGateway}){
 if(!input.config.corpId||!input.config.secret||!input.config.agentId)return {status:"unavailable" as const,reason:"wecom_unconfigured"};
 if(!input.external_user_id)return {status:"unavailable" as const,reason:"wecom_identity_unavailable"};
 const result=await input.gateway.sendText({corpId:input.config.corpId,secret:input.config.secret,agentId:input.config.agentId,externalUserId:input.external_user_id,content:renderNotificationTemplate(input.template_key,input.payload)});
 return result.ok?{status:"sent" as const,provider_message_id:result.messageId}:{status:"failed" as const,reason:result.reason||"wecom_send_failed"};
}

export function reminderEligibility(input:{action_status:string;applies_to_user:number|null;event_decision:string;deadline:string|null;deadline_confidence:number|null;has_unresolved_conflict:boolean;deadline_min:number}){
 if(input.action_status!=="confirmed")return {eligible:false,reason:"action_not_confirmed"};
 if(input.applies_to_user!==1)return {eligible:false,reason:"not_current_user"};
 if(input.event_decision==="NEEDS_REVIEW")return {eligible:false,reason:"needs_review"};
 if(!input.deadline||!deadlineInstant(input.deadline))return {eligible:false,reason:"deadline_unavailable"};
 if((input.deadline_confidence??0)<input.deadline_min)return {eligible:false,reason:"deadline_low_confidence"};
 if(input.has_unresolved_conflict)return {eligible:false,reason:"unresolved_conflict"};
 return {eligible:true as const,reason:null};
}
