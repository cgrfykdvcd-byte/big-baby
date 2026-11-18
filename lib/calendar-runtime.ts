import { DEFAULT_EVENT_ENGINE_CONFIG } from "./event-engine-config";
import { buildActionIcs, calendarEligible, type CalendarAction } from "./calendar-service";
import { notificationPreferences } from "./notification-service";
import { database } from "./storage";

const json=<T>(value:string,fallback:T):T=>{try{return JSON.parse(value) as T}catch{return fallback}};
type CalendarRow={id:string;userId:string;eventId:string;eventTitle:string;eventSummary:string;eventVersion:number;title:string;deadline:string|null;deadlinePrecision:string;location:string|null;sourceMessageIds:string;status:string;appliesToUser:number|null;eventDecision:string;confidenceDetails:string;pendingChanges:number};

export async function readCalendarAction(userId:string,actionId:string){
 const row=await database().prepare("SELECT a.id,a.user_id AS userId,a.event_id AS eventId,e.title AS eventTitle,e.summary AS eventSummary,e.version AS eventVersion,a.title,a.deadline,a.deadline_precision AS deadlinePrecision,a.location,a.source_message_ids AS sourceMessageIds,a.status,a.applies_to_user AS appliesToUser,e.decision AS eventDecision,a.confidence_details AS confidenceDetails,(SELECT COUNT(*) FROM event_changes c WHERE c.user_id=a.user_id AND c.event_id=a.event_id AND c.resolution='pending_review') AS pendingChanges FROM event_actions a JOIN events e ON e.id=a.event_id AND e.user_id=a.user_id WHERE a.user_id=? AND a.id=?").bind(userId,actionId).first<CalendarRow>();
 if(!row)return null;const details=json<{deadline_confidence?:number|null}>(row.confidenceDetails,{});return {id:row.id,user_id:row.userId,event_id:row.eventId,event_title:row.eventTitle,event_summary:row.eventSummary,event_version:row.eventVersion,title:row.title,deadline:row.deadline||"",deadline_precision:row.deadlinePrecision,location:row.location,source_message_ids:json<string[]>(row.sourceMessageIds,[]),status:row.status,applies_to_user:row.appliesToUser,event_decision:row.eventDecision,deadline_confidence:details.deadline_confidence??null,has_unresolved_conflict:row.pendingChanges>0} satisfies CalendarAction;
}

export async function generateActionIcs(userId:string,actionId:string){
 const [action,preferences]=await Promise.all([readCalendarAction(userId,actionId),notificationPreferences(userId)]);if(!action)throw new Error("calendar_action_not_found");const eligibility=calendarEligible(action,preferences,DEFAULT_EVENT_ENGINE_CONFIG.auto_candidate.deadline_min);if(!eligibility.eligible)return {eligible:false as const,reason:eligibility.reason,action};const time=new Date().toISOString(),db=database(),uid=`big-baby-action-${action.id}@juying-campus`;await db.prepare("INSERT INTO calendar_records (id,user_id,event_id,action_id,provider,external_calendar_event_id,status,last_synced_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,action_id,provider) DO UPDATE SET event_id=excluded.event_id,external_calendar_event_id=excluded.external_calendar_event_id,status='active',last_synced_at=excluded.last_synced_at,updated_at=excluded.updated_at").bind(crypto.randomUUID(),userId,action.event_id,action.id,"ics",uid,"active",time,time,time).run();return {eligible:true as const,reason:null,action,ics:buildActionIcs(action)};
}

export async function markCalendarRecordStale(userId:string,actionId:string){await database().prepare("UPDATE calendar_records SET status='stale',updated_at=? WHERE user_id=? AND action_id=? AND status='active'").bind(new Date().toISOString(),userId,actionId).run();}
