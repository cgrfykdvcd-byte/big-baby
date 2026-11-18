import { DEFAULT_EVENT_ENGINE_CONFIG } from "./event-engine-config.ts";

export type ReviewReasonCode="UNCERTAIN_EVENT_MATCH"|"UNCERTAIN_ROLE"|"UNCERTAIN_DEADLINE"|"UNCERTAIN_LOCATION"|"UNCERTAIN_MATERIALS"|"UNRESOLVED_CONFLICT"|"LOW_ACTION_CONFIDENCE"|"LOW_ENTITY_CONFIDENCE";
export type ReviewReason={code:ReviewReasonCode;field:string|null;message_key:string;confidence:number|null;source_message_ids:string[];metadata:Record<string,unknown>};
type ConfidenceDetails=Partial<{event_match_confidence:number;role_confidence:number;entity_confidence:number;action_confidence:number;deadline_confidence:number}>;
type ActionLike={id:string;deadline:string|null;location:string|null;materials:string[];confidence:number;confidenceDetails?:ConfidenceDetails;sourceMessageIds:string[]};
type ChangeLike={field:string;confidence:number;resolution:string;sourceMessageIds:string[]};

export function deriveReviewReasons(input:{decision:string;confidenceDetails:ConfidenceDetails;actions:ActionLike[];changes:ChangeLike[];sourceMessageIds:string[];roleResolved?:boolean}):ReviewReason[]{
 const c=DEFAULT_EVENT_ENGINE_CONFIG.auto_candidate,reasons:ReviewReason[]=[];
 const push=(code:ReviewReasonCode,field:string|null,confidence:number|null,source_message_ids:string[],metadata:Record<string,unknown>={})=>reasons.push({code,field,message_key:`review.${code.toLowerCase()}`,confidence,source_message_ids,metadata});
 if(input.decision==="NEEDS_REVIEW"&&input.confidenceDetails.event_match_confidence!==undefined&&input.confidenceDetails.event_match_confidence<c.event_match_min)push("UNCERTAIN_EVENT_MATCH",null,input.confidenceDetails.event_match_confidence,input.sourceMessageIds);
 if(!input.roleResolved&&input.confidenceDetails.role_confidence!==undefined&&input.confidenceDetails.role_confidence<c.role_min)push("UNCERTAIN_ROLE","target_role",input.confidenceDetails.role_confidence,input.sourceMessageIds);
 if(input.confidenceDetails.entity_confidence!==undefined&&input.confidenceDetails.entity_confidence<c.entity_min)push("LOW_ENTITY_CONFIDENCE",null,input.confidenceDetails.entity_confidence,input.sourceMessageIds);
 for(const action of input.actions){const details=action.confidenceDetails||{};if(action.deadline&&details.deadline_confidence!==undefined&&details.deadline_confidence<c.deadline_min)push("UNCERTAIN_DEADLINE","deadline",details.deadline_confidence,action.sourceMessageIds,{action_id:action.id});if(action.confidence<c.action_min)push("LOW_ACTION_CONFIDENCE","action",action.confidence,action.sourceMessageIds,{action_id:action.id});}
 for(const change of input.changes)if(change.resolution==="pending_review")push("UNRESOLVED_CONFLICT",change.field,change.confidence,change.sourceMessageIds);
 return reasons;
}
