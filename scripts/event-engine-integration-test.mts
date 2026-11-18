import assert from "node:assert/strict";
import { createEventEngine, defaultUserRoleContext } from "../lib/event-engine-runtime.ts";
import type { EventCandidateSnapshot } from "../lib/event-engine.ts";
import type { NormalizedMessage } from "../lib/inbox.ts";

const message=(id:string,text:string,source_type:NormalizedMessage["source_type"]="text",confidence:NormalizedMessage["confidence"]="high"):NormalizedMessage=>({id,user_id:"u1",source_type,source_id:`inbox-${id}`,inbox_item_id:`inbox-${id}`,normalization_id:`run-${id}`,normalization_version:1,text,language:"zh-CN",timestamp:"2026-09-13T08:00:00.000Z",sender:"教务处",attachments:[],metadata:{},confidence});
const engine=createEventEngine(),context=defaultUserRoleContext("u1");
const run=(messages:NormalizedMessage[],existing_events:EventCandidateSnapshot[]=[])=>(engine.process({messages,user_context:context,existing_events}));

// CASE 1: distinct notices create distinct Events.
const assignment=await run([message("a","全体同学请于2026-09-18前提交概率论作业。")]);
const meeting=await run([message("b","2026-09-19召开班会，地点 A101。")],[{event:assignment.event.value,actions:assignment.actions.value}]);
assert.equal(assignment.match.value.decision,"create_new_event");
assert.equal(meeting.match.value.decision,"create_new_event");

// CASE 2: hardship supplements merge and retain multiple actions.
const aidA=await run([message("aid-a","家庭经济困难认定：申请学生请于2026-09-19前提交申请表和证明材料，电子版发送。")]);
const aidB=await run([message("aid-b","家庭经济困难认定申请学生请于2026-09-22前提交纸质材料。","file")],[{event:aidA.event.value,actions:aidA.actions.value}]);
assert.equal(aidB.match.value.decision,"merge_existing_event");
assert.equal(aidA.actions.value.length+aidB.actions.value.length,2);

// CASE 3: text plus image is merged as multi-evidence, never deleted.
const image=await run([message("aid-image","家庭经济困难认定：申请学生请于2026-09-19前提交申请表和证明材料，电子版发送。","image")],[{event:aidA.event.value,actions:aidA.actions.value}]);
assert.equal(image.match.value.decision,"merge_existing_event");
assert.equal(new Set([...aidA.event.value.source_message_ids,...image.event.value.source_message_ids]).size,2);

// CASE 4 and CASE 9: supported corrections become EventChange drafts.
const corrected=await run([message("corrected","更正：全体同学请于2026-09-19前提交概率论作业，地点 B205。")],[{event:assignment.event.value,actions:assignment.actions.value}]);
assert.ok(corrected.conflicts.value.changes.some(change=>change.field==="deadline"));

// CASE 5: unknown review membership is not a user Action.
const review=await run([message("review","评审小组成员不得随意退出。")]);
assert.equal(review.actions.value.length,0);
assert.notEqual(review.review.value.decision,"AUTO_CANDIDATE");

// CASE 6: all students and exact deadline becomes candidate.
assert.equal(assignment.review.value.decision,"AUTO_CANDIDATE");
assert.equal(assignment.candidate_tasks.value.length,1);

// CASE 7: low deadline evidence degrades to review.
const lowDeadline=await run([message("low","全体同学请于周五前提交作业。","text","low")]);
assert.equal(lowDeadline.review.value.decision,"NEEDS_REVIEW");

// CASE 8: an ambiguous match is never forced to merge.
const ambiguous=await run([message("amb","全体同学请于2026-09-20前提交材料。")],[{event:assignment.event.value,actions:assignment.actions.value},{event:aidA.event.value,actions:aidA.actions.value}]);
assert.notEqual(ambiguous.match.value.decision,"merge_existing_event");

// CASE 10: pure notice remains information only.
const notice=await run([message("notice","图书馆本周六开放时间调整为9:00—18:00。")]);
assert.equal(notice.review.value.decision,"INFORMATION_ONLY");

console.log("Event Engine integration tests: PASS (10 fixtures)");
