import type { NotificationPreference } from "./notification";

export type CalendarAction={id:string;user_id:string;event_id:string;event_title:string;event_summary:string;event_version:number;title:string;deadline:string;deadline_precision:string;location:string|null;source_message_ids:string[];status:string;applies_to_user:number|null;event_decision:string;deadline_confidence:number|null;has_unresolved_conflict:boolean};
const escapeIcs=(value:string)=>value.replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\r?\n/g,"\\n");
const compact=(date:Date)=>date.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");
const dateOnly=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value);

export function stableIcsUid(actionId:string){return `big-baby-action-${actionId}@juying-campus`;}
export function buildActionIcs(action:CalendarAction,generatedAt=new Date()){
 const description=[action.event_summary,`Source evidence: ${action.source_message_ids.join(", ")}`].filter(Boolean).join("\n");
 const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Big Baby//Campus Action Desk//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH","BEGIN:VEVENT",`UID:${stableIcsUid(action.id)}`,`DTSTAMP:${compact(generatedAt)}`,`SUMMARY:${escapeIcs(action.title)}`,`DESCRIPTION:${escapeIcs(description)}`,`LOCATION:${escapeIcs(action.location||"")}`];
 if(dateOnly(action.deadline)){const next=new Date(`${action.deadline}T00:00:00Z`);next.setUTCDate(next.getUTCDate()+1);lines.push(`DTSTART;VALUE=DATE:${action.deadline.replace(/-/g,"")}`,`DTEND;VALUE=DATE:${next.toISOString().slice(0,10).replace(/-/g,"")}`);}else{const due=new Date(action.deadline);if(Number.isNaN(due.getTime()))throw new Error("calendar_deadline_unavailable");lines.push(`DTSTART:${compact(due)}`,`DTEND:${compact(new Date(due.getTime()+30*60*1000))}`);}
 lines.push("END:VEVENT","END:VCALENDAR","");return lines.join("\r\n");
}

export function calendarEligible(action:CalendarAction,preferences:Pick<NotificationPreference,"calendar_enabled">,deadlineMin:number){
 if(!preferences.calendar_enabled)return {eligible:false,reason:"calendar_disabled"};
 if(action.status!=="confirmed")return {eligible:false,reason:"action_not_confirmed"};
 if(action.applies_to_user!==1)return {eligible:false,reason:"not_current_user"};
 if(action.event_decision==="NEEDS_REVIEW")return {eligible:false,reason:"needs_review"};
 if(action.has_unresolved_conflict)return {eligible:false,reason:"unresolved_conflict"};
 if(!action.deadline||(action.deadline_confidence??0)<deadlineMin)return {eligible:false,reason:"deadline_low_confidence"};
 return {eligible:true as const,reason:null};
}
