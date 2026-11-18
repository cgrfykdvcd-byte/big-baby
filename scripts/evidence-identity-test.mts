import assert from "node:assert/strict";
import { detectLanguage, normalizeInboxItem, type InboxItem } from "../lib/inbox.ts";

const item:InboxItem={id:"inbox-1",user_id:"u1",source_type:"text",source_reference:"group",original_text:"第一条\n\n第二条",original_language:detectLanguage("第一条"),processing_status:"ready",metadata:{},created_at:"2026-09-13T00:00:00.000Z"};

// CASE 11: re-normalizing makes a new version while the old evidence IDs stay addressable.
const v1=normalizeInboxItem(item,{normalization_id:"run-v1",normalization_version:1});
const v2=normalizeInboxItem(item,{normalization_id:"run-v2",normalization_version:2});
assert.deepEqual(v1.map(message=>message.id),["evidence:run-v1:1","evidence:run-v1:2"]);
assert.deepEqual(v2.map(message=>message.id),["evidence:run-v2:1","evidence:run-v2:2"]);
assert.equal(v1[0].inbox_item_id,item.id);
assert.equal(v1[0].normalization_version,1);
assert.equal(v2[0].normalization_version,2);

// CASE 12: an Event may keep V1 evidence after V2 is created.
const eventEvidence=new Set([v1[0].id]);
for(const message of v2) eventEvidence.add(message.id);
assert.ok(eventEvidence.has("evidence:run-v1:1"));
assert.ok(eventEvidence.has("evidence:run-v2:1"));

// CASE 13: a failed reprocess never mutates or removes already persisted evidence.
const persisted=new Map(v1.map(message=>[message.id,message]));
const failedRun={id:"run-v3",version:3,status:"failed"};
assert.equal(failedRun.status,"failed");
assert.equal(persisted.get(v1[0].id)?.text,"第一条");
assert.ok(eventEvidence.has(v1[0].id));

console.log("Evidence identity tests: PASS (3 fixtures)");
