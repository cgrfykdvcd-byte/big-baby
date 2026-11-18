import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createEventEngine, defaultUserRoleContext } from "../lib/event-engine-runtime.ts";
import type { EventCandidateSnapshot } from "../lib/event-engine.ts";
import type { NormalizedMessage } from "../lib/inbox.ts";

const [inbox,service,handoffRoute,credentialRoute,migration,schema]=await Promise.all([
 readFile(new URL("../lib/inbox.ts",import.meta.url),"utf8"),
 readFile(new URL("../lib/chatgpt-handoff.ts",import.meta.url),"utf8"),
 readFile(new URL("../app/api/integrations/chatgpt/handoff/route.ts",import.meta.url),"utf8"),
 readFile(new URL("../app/api/integrations/chatgpt/route.ts",import.meta.url),"utf8"),
 readFile(new URL("../drizzle/0009_cultured_frank_castle.sql",import.meta.url),"utf8"),
 readFile(new URL("../db/schema.ts",import.meta.url),"utf8"),
]);

const message=(id:string,text:string,source_type:NormalizedMessage["source_type"]="chatgpt",explicit_intent=false):NormalizedMessage=>({
 id,user_id:"student-a",inbox_item_id:`inbox-${id}`,normalization_id:`run-${id}`,normalization_version:1,
 source_type,source_id:`inbox-${id}`,text,language:"zh-CN",timestamp:"2026-09-16T10:00:00.000Z",sender:"",attachments:[],metadata:{integration:{explicit_intent}},confidence:"medium",
});
const run=async(messages:NormalizedMessage[],existing_events:EventCandidateSnapshot[]=[])=>(createEventEngine()).process({messages,user_context:defaultUserRoleContext("student-a"),existing_events});

// 1: the exact Production wording creates a user Action and candidate task.
const exact=await run([message("exact","加入巨婴系统：\n2026-09-18 17:00 前完成概率论作业。","chatgpt",true)]);
assert.equal(exact.actions.value.length,1);
assert.equal(exact.actions.value[0].actor.role,"user");
assert.equal(exact.actions.value[0].deadline,"2026-09-18T17:00");
assert.equal(exact.actions.value[0].confidence_breakdown.deadline_confidence,.95);
assert.equal(exact.review.value.decision,"AUTO_CANDIDATE");
assert.equal(exact.candidate_tasks.value.length,1);
assert.equal(service.includes("explicit_intent:input.explicit_intent"),true);

// 2: explicit intent does not turn speculative future information into an Action.
const tentative=await run([message("tentative","加入巨婴系统：老师可能下周会布置作业。","chatgpt",true)]);
assert.equal(tentative.actions.value.length,0);
assert.notEqual(tentative.review.value.decision,"AUTO_CANDIDATE");

// 3: competition/registration remains classifier-driven while explicit intent supplies user relevance.
const competition=await run([message("competition","加入巨婴系统：9月25日前提交比赛报名表。","chatgpt",true)]);
assert.equal(competition.classification.value.event_type,"activity");
assert.equal(competition.classification.value.tags.includes("competition"),true);
assert.equal(competition.actions.value.length,1);
assert.equal(competition.actions.value[0].actor.role,"user");

// 4: a relative Friday creates an Action but is not promoted to a reliable deadline.
const vague=await run([message("vague","加入巨婴系统：周五完成概率论作业。","chatgpt",true)]);
assert.equal(vague.review.value.decision,"NEEDS_REVIEW");
assert.equal(vague.actions.value.length,1);
assert.ok(vague.review.value.reasons.includes("deadline_confidence_below_threshold"));
assert.equal(vague.candidate_tasks.value.length,0);

// 5: relative time and an errand stay actionable while deadline safety remains independent.
const relative=await run([message("relative","加入巨婴系统：明天下午去辅导员办公室交材料。","chatgpt",true)]);
assert.equal(relative.actions.value.length,1);
assert.equal(relative.actions.value[0].deadline,"明天下午");
assert.equal(relative.review.value.decision,"NEEDS_REVIEW");
assert.ok(relative.review.value.reasons.includes("deadline_confidence_below_threshold"));

// 6: an action verb without explicit intent cannot bypass role and confidence gates.
const control=await run([message("control","完成概率论作业。","chatgpt",false)]);
assert.equal(control.actions.value.length,1);
assert.equal(control.actions.value[0].actor.applies_to_user,null);
assert.equal(control.review.value.decision,"NEEDS_REVIEW");
assert.equal(control.candidate_tasks.value.length,0);

// 7: ordinary sources keep the same non-handoff behavior.
const ordinaryText=await run([message("ordinary-text","全体同学请于 2026-09-18 17:00 前提交概率论作业。","text")]);
for(const source of ["file","wecom"] as const){
 const ordinary=await run([message(`ordinary-${source}`,"全体同学请于 2026-09-18 17:00 前提交概率论作业。",source)]);
 assert.equal(ordinary.review.value.decision,ordinaryText.review.value.decision);
 assert.equal(ordinary.actions.value.length,ordinaryText.actions.value.length);
}

// 5: a stable receipt makes retry idempotent before Inbox processing.
assert.equal(migration.includes("idx_external_integration_receipts_credential_request"),true);
assert.equal(service.includes("INSERT OR IGNORE INTO external_integration_receipts"),true);

// 6–7: revoked credentials are rejected and the integration never accepts a body user ID.
assert.equal(service.includes('row.status!=="active"'),true);
assert.equal(handoffRoute.includes("user_id"),false);
assert.equal(credentialRoute.includes("user_id"),false);

// 8: the new source remains inside the immutable Inbox/normalization path.
assert.equal(inbox.includes('"chatgpt"'),true);
assert.equal(service.includes('importMessages(credential.userId,input.original_text,"ChatGPT handoff","chatgpt"'),true);
assert.equal(service.includes("sourceReference:input.source_reference"),true);

// 9: a matching ChatGPT message merges through the existing Event Engine.
const duplicate=await run([message("duplicate","全体同学请于 2026-09-18 17:00 前提交概率论作业。","text")]);
const matched=await run([message("chatgpt-copy","全体同学请于 2026-09-18 17:00 前提交概率论作业。")],[{event:duplicate.event.value,actions:duplicate.actions.value}]);
assert.equal(matched.match.value.decision,"merge_existing_event");

// 10: credentials and receipts are additive; no Event schema is repurposed.
for(const required of ["external_integration_credentials","external_integration_receipts","provider","secret_hash","status","revoked_at"]){
 assert.equal(migration.includes(required)&&schema.includes(required),true,required);
}
assert.equal(service.includes("entryUpsert"),false);
assert.equal(service.includes("INSERT INTO entries"),false);

console.log("ChatGPT handoff contract tests: PASS (15 fixtures)");
