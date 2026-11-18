import { env } from "cloudflare:workers";
import { DEFAULT_EVENT_ENGINE_CONFIG } from "./event-engine-config";
import { planReminders, reminderEligibility, renderNotificationTemplate, type NotificationChannel, type NotificationPayload, type NotificationPreference, type NotificationStatus } from "./notification";
import { database } from "./storage";

type PreferenceRow={userId:string;webEnabled:number;wecomEnabled:number;pushEnabled:number;smsEnabled:number;calendarEnabled:number;criticalSmsEnabled:number;quietHoursStart:string;quietHoursEnd:string;deadline1dEnabled:number;deadline2hEnabled:number;createdAt:string;updatedAt:string};
type ActionDeliveryRow={id:string;userId:string;eventId:string;eventTitle:string;eventSummary:string;eventDecision:string;actionTitle:string;actionStatus:string;appliesToUser:number|null;deadline:string|null;location:string|null;sourceMessageIds:string;confidenceDetails:string;eventVersion:number;pendingChanges:number};
type NotificationRow={id:string;userId:string;eventId:string;actionId:string;channel:NotificationChannel;priority:"normal"|"critical";status:NotificationStatus;scheduledAt:string;sentAt:string|null;templateKey:string;payload:string;dedupKey:string;createdAt:string;updatedAt:string};

const now=()=>new Date().toISOString();
const json=<T>(value:string,fallback:T):T=>{try{return JSON.parse(value) as T}catch{return fallback}};
const enabled=(value:number)=>value===1;
const fromRow=(row:PreferenceRow):NotificationPreference=>({user_id:row.userId,web_enabled:enabled(row.webEnabled),wecom_enabled:enabled(row.wecomEnabled),push_enabled:enabled(row.pushEnabled),sms_enabled:enabled(row.smsEnabled),calendar_enabled:enabled(row.calendarEnabled),critical_sms_enabled:enabled(row.criticalSmsEnabled),quiet_hours_start:row.quietHoursStart,quiet_hours_end:row.quietHoursEnd,deadline_1d_enabled:enabled(row.deadline1dEnabled),deadline_2h_enabled:enabled(row.deadline2hEnabled)});

export async function notificationPreferences(userId:string):Promise<NotificationPreference>{
 const db=database(),row=await db.prepare("SELECT user_id AS userId,web_enabled AS webEnabled,wecom_enabled AS wecomEnabled,push_enabled AS pushEnabled,sms_enabled AS smsEnabled,calendar_enabled AS calendarEnabled,critical_sms_enabled AS criticalSmsEnabled,quiet_hours_start AS quietHoursStart,quiet_hours_end AS quietHoursEnd,deadline_1d_enabled AS deadline1dEnabled,deadline_2h_enabled AS deadline2hEnabled,created_at AS createdAt,updated_at AS updatedAt FROM notification_preferences WHERE user_id=?").bind(userId).first<PreferenceRow>();
 if(row)return fromRow(row);const time=now();await db.prepare("INSERT OR IGNORE INTO notification_preferences (user_id,created_at,updated_at) VALUES (?,?,?)").bind(userId,time,time).run();return notificationPreferences(userId);
}

export async function updateNotificationPreferences(userId:string,patch:Partial<Omit<NotificationPreference,"user_id">>){
 const current=await notificationPreferences(userId),next={...current,...patch},db=database();
 await db.prepare("UPDATE notification_preferences SET web_enabled=?,wecom_enabled=?,push_enabled=?,sms_enabled=?,calendar_enabled=?,critical_sms_enabled=?,quiet_hours_start=?,quiet_hours_end=?,deadline_1d_enabled=?,deadline_2h_enabled=?,updated_at=? WHERE user_id=?").bind(next.web_enabled?1:0,next.wecom_enabled?1:0,next.push_enabled?1:0,next.sms_enabled?1:0,next.calendar_enabled?1:0,next.critical_sms_enabled?1:0,next.quiet_hours_start,next.quiet_hours_end,next.deadline_1d_enabled?1:0,next.deadline_2h_enabled?1:0,now(),userId).run();return next;
}

async function actionForDelivery(userId:string,actionId:string){
 return database().prepare("SELECT a.id,a.user_id AS userId,a.event_id AS eventId,e.title AS eventTitle,e.summary AS eventSummary,e.decision AS eventDecision,e.version AS eventVersion,a.title AS actionTitle,a.status AS actionStatus,a.applies_to_user AS appliesToUser,a.deadline,a.location,a.source_message_ids AS sourceMessageIds,a.confidence_details AS confidenceDetails,(SELECT COUNT(*) FROM event_changes c WHERE c.user_id=a.user_id AND c.event_id=a.event_id AND c.resolution='pending_review') AS pendingChanges FROM event_actions a JOIN events e ON e.id=a.event_id AND e.user_id=a.user_id WHERE a.user_id=? AND a.id=?").bind(userId,actionId).first<ActionDeliveryRow>();
}

function deliveryEligibility(row:ActionDeliveryRow){
 const details=json<{deadline_confidence?:number|null}>(row.confidenceDetails,{});return reminderEligibility({action_status:row.actionStatus,applies_to_user:row.appliesToUser,event_decision:row.eventDecision,deadline:row.deadline,deadline_confidence:details.deadline_confidence??null,has_unresolved_conflict:row.pendingChanges>0,deadline_min:DEFAULT_EVENT_ENGINE_CONFIG.auto_candidate.deadline_min});
}

export async function cancelActionReminders(userId:string,actionId:string){
 await database().prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE user_id=? AND action_id=? AND status IN ('scheduled','suppressed')").bind(now(),userId,actionId).run();
}

export async function scheduleActionReminders(userId:string,actionId:string){
 const row=await actionForDelivery(userId,actionId);if(!row)return {scheduled:0,eligible:false,reason:"action_not_found"};const eligible=deliveryEligibility(row);if(!eligible.eligible){await cancelActionReminders(userId,actionId);return {scheduled:0,...eligible};}
 const preferences=await notificationPreferences(userId),plans=planReminders({action_id:row.id,event_title:row.eventTitle,action_title:row.actionTitle,deadline:row.deadline!,location:row.location,source_message_ids:json<string[]>(row.sourceMessageIds,[]),preferences});
 const db=database(),existing=await db.prepare("SELECT id,payload FROM notifications WHERE user_id=? AND action_id=? AND status IN ('scheduled','suppressed')").bind(userId,actionId).all<{id:string;payload:string}>(),obsolete=existing.results.filter(item=>json<NotificationPayload>(item.payload,{} as NotificationPayload).deadline!==row.deadline);
 const time=now(),statements:D1PreparedStatement[]=[];for(const item of obsolete)statements.push(db.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE id=? AND user_id=?").bind(time,item.id,userId));for(const plan of plans)statements.push(db.prepare("INSERT OR IGNORE INTO notifications (id,user_id,event_id,action_id,channel,priority,status,scheduled_at,sent_at,template_key,payload,dedup_key,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),userId,row.eventId,actionId,plan.channel,plan.priority,"scheduled",plan.scheduled_at,null,plan.template_key,JSON.stringify(plan.payload),plan.dedup_key,time,time));if(statements.length)await db.batch(statements);return {scheduled:plans.length,eligible:true,reason:null};
}

export async function listNotifications(userId:string){
 const rows=await database().prepare("SELECT id,user_id AS userId,event_id AS eventId,action_id AS actionId,channel,priority,status,scheduled_at AS scheduledAt,sent_at AS sentAt,template_key AS templateKey,payload,dedup_key AS dedupKey,created_at AS createdAt,updated_at AS updatedAt FROM notifications WHERE user_id=? ORDER BY scheduled_at DESC LIMIT 200").bind(userId).all<NotificationRow>();
 return rows.results.map(row=>({...row,payload:json<NotificationPayload>(row.payload,{} as NotificationPayload)}));
}

export type ProviderResult={status:"sent"|"unavailable"|"failed";provider_message_id?:string;reason?:string};
export type NotificationProvider={channel:NotificationChannel;send(notification:{id:string;user_id:string;template_key:string;payload:NotificationPayload}):Promise<ProviderResult>};
export class WebNotificationProvider implements NotificationProvider{channel:NotificationChannel="web";async send(notification:{id:string;user_id:string;template_key:string;payload:NotificationPayload}):Promise<ProviderResult>{void notification;return {status:"sent",provider_message_id:`web:${notification.id}`};}}
export class PushNotificationProvider implements NotificationProvider{channel:NotificationChannel="push";async send():Promise<ProviderResult>{return {status:"unavailable",reason:"push_future"};}}
export class SmsNotificationProvider implements NotificationProvider{channel:NotificationChannel="sms";async send():Promise<ProviderResult>{return {status:"unavailable",reason:"sms_future"};}}

export type WeComGateway={sendText(input:{corpId:string;secret:string;agentId:string;externalUserId:string;content:string}):Promise<{ok:boolean;messageId?:string;reason?:string}>};
export class CloudflareWeComGateway implements WeComGateway{
 async sendText(input:{corpId:string;secret:string;agentId:string;externalUserId:string;content:string}){
  try{
   const tokenResponse=await fetch(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(input.corpId)}&corpsecret=${encodeURIComponent(input.secret)}`);
   const token=await tokenResponse.json() as {access_token?:string};
   if(!tokenResponse.ok||!token.access_token)return {ok:false,reason:"wecom_token_unavailable"};
   const response=await fetch(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(token.access_token)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({touser:input.externalUserId,msgtype:"text",agentid:Number(input.agentId),text:{content:input.content},safe:0})});
   const body=await response.json() as {errcode?:number;msgid?:string};
   return body.errcode===0?{ok:true,messageId:body.msgid}:{ok:false,reason:"wecom_send_failed"};
  }catch{return {ok:false,reason:"wecom_network_failure"};}
 }
}
export class WeComNotificationProvider implements NotificationProvider{channel:NotificationChannel="wecom";constructor(private gateway:WeComGateway=new CloudflareWeComGateway()){}async send(notification:{id:string;user_id:string;template_key:string;payload:NotificationPayload}):Promise<ProviderResult>{const values=env as unknown as Record<string,string|undefined>,corpId=values.WECHAT_CORP_ID?.trim()||"",secret=values.WECHAT_SECRET?.trim()||"",agentId=values.WECHAT_AGENT_ID?.trim()||"";if(!corpId||!secret||!agentId)return {status:"unavailable",reason:"wecom_unconfigured"};const identity=await database().prepare("SELECT external_user_id AS externalUserId FROM external_identities WHERE provider='wecom' AND internal_user_id=? AND verification_status='verified' LIMIT 1").bind(notification.user_id).first<{externalUserId:string}>();if(!identity)return {status:"unavailable",reason:"wecom_identity_unavailable"};const result=await this.gateway.sendText({corpId,secret,agentId,externalUserId:identity.externalUserId,content:renderNotificationTemplate(notification.template_key,notification.payload)});return result.ok?{status:"sent",provider_message_id:result.messageId}:{status:"failed",reason:result.reason||"wecom_send_failed"};}}

function providerFor(channel:NotificationChannel):NotificationProvider{return channel==="web"?new WebNotificationProvider():channel==="wecom"?new WeComNotificationProvider():channel==="push"?new PushNotificationProvider():new SmsNotificationProvider();}
export async function sendTestNotification(userId:string,channel:NotificationChannel){
 const time=now(),payload:NotificationPayload={action_title:"Big Baby",event_title:"Big Baby",deadline:time,source_message_ids:[],reminder_kind:"test"},id=crypto.randomUUID(),db=database();await db.prepare("INSERT INTO notifications (id,user_id,event_id,action_id,channel,priority,status,scheduled_at,sent_at,template_key,payload,dedup_key,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,userId,"","",channel,"normal","scheduled",time,null,"test",JSON.stringify(payload),`test:${id}`,time,time).run();const result=await providerFor(channel).send({id,user_id:userId,template_key:"test",payload}),status:NotificationStatus=result.status==="sent"?"sent":result.status==="unavailable"?"suppressed":"failed";await db.prepare("UPDATE notifications SET status=?,sent_at=?,updated_at=? WHERE id=? AND user_id=?").bind(status,status==="sent"?now():null,now(),id,userId).run();return {id,channel,status,result};
}
