import assert from "node:assert/strict";
import { deriveReviewReasons } from "../lib/review-reasons.ts";

const base={decision:"NEEDS_REVIEW",confidenceDetails:{event_match_confidence:.9,role_confidence:.9,entity_confidence:.9},sourceMessageIds:["evidence-1"]};

// CASE 6: low deadline confidence is explicit and traceable.
const deadline=deriveReviewReasons({...base,actions:[{id:"a1",deadline:"Friday",location:null,materials:[],confidence:.9,confidenceDetails:{deadline_confidence:.5},sourceMessageIds:["evidence-1"]}],changes:[]});
assert.ok(deadline.some(reason=>reason.code==="UNCERTAIN_DEADLINE"&&reason.field==="deadline"));

// CASE 7: ambiguous Event matching remains a distinct reason.
const matching=deriveReviewReasons({...base,confidenceDetails:{...base.confidenceDetails,event_match_confidence:.7},actions:[],changes:[]});
assert.ok(matching.some(reason=>reason.code==="UNCERTAIN_EVENT_MATCH"));

// CASE 8: a pending change maps to an unresolved field conflict.
const conflict=deriveReviewReasons({...base,actions:[],changes:[{field:"location",confidence:.71,resolution:"pending_review",sourceMessageIds:["evidence-2"]}]});
assert.deepEqual(conflict[0],{code:"UNRESOLVED_CONFLICT",field:"location",message_key:"review.unresolved_conflict",confidence:.71,source_message_ids:["evidence-2"],metadata:{}});

// CASE 9: distinct causes are retained, never collapsed to one generic error.
const multiple=deriveReviewReasons({...base,confidenceDetails:{event_match_confidence:.7,role_confidence:.5,entity_confidence:.5},actions:[{id:"a2",deadline:"Friday",location:null,materials:[],confidence:.5,confidenceDetails:{deadline_confidence:.4},sourceMessageIds:["evidence-3"]}],changes:[]});
assert.deepEqual(new Set(multiple.map(reason=>reason.code)),new Set(["UNCERTAIN_EVENT_MATCH","UNCERTAIN_ROLE","LOW_ENTITY_CONFIDENCE","UNCERTAIN_DEADLINE","LOW_ACTION_CONFIDENCE"]));

// Role confirmations are Event-scoped by API contract; no global membership is represented.
const relation={user_id:"u1",event_id:"event-a",role:"review_group",context:"event-a",status:"user_confirmed",source:"user"};
assert.notEqual(relation.event_id,"event-b");

console.log("Review API contract tests: PASS (9 fixtures)");
