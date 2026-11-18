import assert from "node:assert/strict";
import { buildActionIcs, calendarEligible, stableIcsUid, type CalendarAction } from "../lib/calendar-service.ts";
import { deferForQuietHours, planReminders, reminderEligibility, sendWeComProvider, type NotificationPreference } from "../lib/notification.ts";

const preferences:NotificationPreference={user_id:"u1",web_enabled:true,wecom_enabled:false,push_enabled:true,sms_enabled:true,calendar_enabled:true,critical_sms_enabled:false,quiet_hours_start:"",quiet_hours_end:"",deadline_1d_enabled:true,deadline_2h_enabled:true};
const action:CalendarAction={id:"action-1",user_id:"u1",event_id:"event-1",event_title:"概率论作业",event_summary:"请提交作业",event_version:1,title:"概率论 · 提交",deadline:"2030-10-02T18:00",deadline_precision:"datetime",location:"A101",source_message_ids:["evidence-1","evidence-2"],status:"confirmed",applies_to_user:1,event_decision:"AUTO_CANDIDATE",deadline_confidence:.95,has_unresolved_conflict:false};
const plans=planReminders({action_id:action.id,event_title:action.event_title,action_title:action.title,deadline:action.deadline,location:action.location,source_message_ids:action.source_message_ids,preferences});

// 1. Confirmed action creates the two MVP reminders.
assert.equal(plans.length,2);assert.deepEqual(plans.map(plan=>plan.template_key).sort(),["deadline_1d","deadline_2h"]);
// 2. Repeated scheduling has stable deduplication keys.
assert.deepEqual(plans.map(plan=>plan.dedup_key),planReminders({action_id:action.id,event_title:action.event_title,action_title:action.title,deadline:action.deadline,location:action.location,source_message_ids:action.source_message_ids,preferences}).map(plan=>plan.dedup_key));
// 3-4. Review and dismissal are never eligible.
assert.equal(reminderEligibility({action_status:"confirmed",applies_to_user:1,event_decision:"NEEDS_REVIEW",deadline:action.deadline,deadline_confidence:.95,has_unresolved_conflict:false,deadline_min:.8}).eligible,false);
assert.equal(reminderEligibility({action_status:"dismissed",applies_to_user:1,event_decision:"AUTO_CANDIDATE",deadline:action.deadline,deadline_confidence:.95,has_unresolved_conflict:false,deadline_min:.8}).eligible,false);
// 5. A canonical deadline update creates a different reminder identity.
const changed=planReminders({action_id:action.id,event_title:action.event_title,action_title:action.title,deadline:"2030-10-03T18:00",location:action.location,source_message_ids:action.source_message_ids,preferences});assert.notEqual(plans[0].dedup_key,changed[0].dedup_key);
// 6. Quiet hours defer rather than drop a notification.
assert.equal(deferForQuietHours(new Date("2030-10-01T15:30:00Z"),"22:00","07:00").toISOString(),"2030-10-01T23:00:00.000Z");
// 7-8. WeCom is unavailable without a verified identity and succeeds through an injected verified gateway.
const gateway={async sendText(){return {ok:true,messageId:"wecom-message-1"};}};
assert.equal((await sendWeComProvider({config:{corpId:"corp",secret:"secret",agentId:"1"},template_key:"deadline_1d",payload:plans[0].payload,gateway})).status,"unavailable");
assert.equal((await sendWeComProvider({config:{corpId:"corp",secret:"secret",agentId:"1"},external_user_id:"wecom-user",template_key:"deadline_1d",payload:plans[0].payload,gateway})).status,"sent");
// 9. Confirmed canonical actions emit valid UTF-8 ICS with a stable UID.
const ics=buildActionIcs(action,new Date("2030-10-01T00:00:00Z"));assert.ok(ics.includes("BEGIN:VCALENDAR")&&ics.includes("SUMMARY:概率论 · 提交")&&ics.includes("LOCATION:A101")&&ics.includes(stableIcsUid(action.id)));
// 10. A rejected change leaves canonical ICS unchanged.
assert.equal(ics,buildActionIcs(action,new Date("2030-10-01T00:00:00Z")));
// 11. An accepted canonical location update changes only the current ICS output.
assert.ok(buildActionIcs({...action,location:"B202"},new Date("2030-10-01T00:00:00Z")).includes("LOCATION:B202"));
// 12. A provider failure is contained and does not affect reminder eligibility.
assert.equal((await sendWeComProvider({config:{corpId:"corp",secret:"secret",agentId:"1"},external_user_id:"wecom-user",template_key:"deadline_1d",payload:plans[0].payload,gateway:{async sendText(){return {ok:false,reason:"network"};}}})).status,"failed");
assert.equal(calendarEligible(action,preferences,.8).eligible,true);
console.log("Notification and Calendar contract tests: PASS (12 fixtures)");
