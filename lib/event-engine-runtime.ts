import {
  EventEngineService, actionIdentityKey, createEventChangeDraft, decideCandidate, decideEventMatch,
  hasStrongDuplicateEvidence, normalizedMessageConfidence, roleAppliesToUser,
  scoreEventMatch, type Action, type ActionDraft, type ActionGenerator, type ClassificationStage,
  type ConflictDetectionStage, type ConfidenceBreakdown, type EntityExtractionStage, type Event,
  type EventAssembler, type EventCandidateSnapshot, type EventMatchFactors, type EventMatchingStage,
  type EventParticipant, type EventType, type EventEngineStages, type ReviewDecisionStage,
  type RoleBinding, type RoleResolutionStage, type StageResult, type CandidateTaskProjector,
  type UserRoleContext, type EventInformation, type EventChangeDraft,
} from "./event-engine.ts";
import { DEFAULT_EVENT_ENGINE_CONFIG } from "./event-engine-config.ts";
import type { NormalizedMessage } from "./inbox.ts";

const now=()=>new Date().toISOString();
const words=(value:string)=>new Set((value.toLocaleLowerCase("en-US").match(/[\p{L}\p{N}]+/gu)||[]).filter(word=>word.length>1));
const overlap=(a:Iterable<string>,b:Iterable<string>)=>{const A=new Set(a),B=new Set(b);if(!A.size||!B.size)return 0;let same=0;for(const x of A)if(B.has(x))same++;return same/Math.max(A.size,B.size);};
const average=(values:number[])=>values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
const issue=(code:string,message:string,ids:string[])=>({code,message,source_message_ids:ids});
const stage=<T>(value:T,confidence:number,issues:ReturnType<typeof issue>[]=[]):StageResult<T>=>({outcome:issues.length?"degraded":"ok",value,confidence,issues});
const textOf=(messages:NormalizedMessage[])=>messages.map(message=>message.text).join("\n");
const ids=(messages:NormalizedMessage[])=>messages.map(message=>message.id);
const has=(text:string,pattern:RegExp)=>pattern.test(text);
const explicitUpdate=(text:string)=>has(text,/(改为|更正|修改|更新|调整为|changed\s+to|corrected|updated|rescheduled)/i);
const metadataObject=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
function explicitIntent(message:NormalizedMessage){
 const metadata=metadataObject(message.metadata),integration=metadataObject(metadata.integration),semantic=metadataObject(metadata.semantic_signals);
 return metadata.explicit_intent===true||integration.explicit_intent===true||semantic.explicit_intent===true;
}
function tentativeCue(text:string){return has(text,/(可能|也许|或许|预计|据说|听说|might|maybe|possibly|may\s|could\s)/i);}

function classifyText(text:string):{event_type:EventType;tags:Event["tags"];confidence:number}{
  if(has(text,/(助学金|困难认定|资助|financial\s+aid|scholarship)/i))return {event_type:"financial_aid",tags:has(text,/(奖学金|scholarship)/i)?["scholarship"]:[],confidence:.91};
  if(has(text,/(竞赛|比赛|演讲赛|competition|contest)/i))return {event_type:"activity",tags:["competition"],confidence:.9};
  if(has(text,/(作业|论文|习题|assignment|homework|coursework)/i))return {event_type:"assignment",tags:[],confidence:.91};
  if(has(text,/(考试|测验|CET[-\s]?\d|exam|test)/i))return {event_type:"exam",tags:has(text,/(报名|register)/i)?["registration"]:[],confidence:.89};
  if(has(text,/(报名|选课|注册|registration|enrol)/i))return {event_type:"administrative",tags:["registration"],confidence:.86};
  if(has(text,/(会议|开会|答辩|meeting)/i))return {event_type:"meeting",tags:[],confidence:.85};
  if(has(text,/(课程|课表|课堂|course|lecture|class)/i))return {event_type:"course",tags:[],confidence:.84};
  if(has(text,/(通知|公示|开放|announcement|notice)/i))return {event_type:"announcement",tags:[],confidence:.72};
  return {event_type:"other",tags:[],confidence:.62};
}
function subject(text:string){
 const patterns=[/(家庭经济困难认定|困难认定|financial\s+aid(?:\s+assessment)?|奖学金|scholarship)/i,/(CET[-\s]?\d[^\n，。,.]{0,18})/i,/([\u4e00-\u9fff]{2,12}(?:作业|论文|材料|报名|通知|会议|课表))/,/(assignment|homework|registration|meeting|coursework)/i];
 for(const pattern of patterns){const match=text.match(pattern);if(match)return match[1].replace(/\s+/g," ").trim();}return (text.replace(/\s+/g," ").slice(0,42)||"校园事项");
}
function deadline(text:string):{value:string|null;confidence:number;precision:"date"|"datetime"|"unknown"}{
 const iso=text.match(/(20\d{2}-\d{2}-\d{2})(?:[ T](\d{1,2}:\d{2}))?/);if(iso)return {value:iso[1]+(iso[2]?`T${iso[2]}`:""),confidence:.95,precision:iso[2]?"datetime":"date"};
 const weekday=text.match(/(?:周|星期)([一二三四五六日天])(?:前|截止)?|\b(?:before|by)\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i);if(weekday)return {value:(weekday[1]?`周${weekday[1]}`:weekday[2]),confidence:.78,precision:"date"};
 const date=text.match(/(\d{1,2}月\d{1,2}[日号]?)(?:\s*(\d{1,2}:\d{2}))?/);if(date)return {value:date[1]+(date[2]?` ${date[2]}`:""),confidence:.86,precision:date[2]?"datetime":"date"};
 const relative=text.match(/(明天(?:上午|下午|晚上)?|下周(?:[一二三四五六日天])?)/);if(relative)return {value:relative[1],confidence:.45,precision:"unknown"};
 return {value:null,confidence:0,precision:"unknown"};
}
function location(text:string){return text.match(/(?:地点|教室|地点改为|at|in)\s*[:：]?\s*((?:[A-Z][-_]?\d{2,4})|(?:[\u4e00-\u9fff]{1,8}(?:楼|室|馆)[A-Z]?\d{0,4}))/i)?.[1]||text.match(/(?:去|到)\s*([\u4e00-\u9fff]{2,16}(?:办公室|楼|室|馆))/)?.[1]||null;}
function materials(text:string){const m:string[]=[];if(has(text,/(申请表|application form)/i))m.push("申请表");if(has(text,/(证明材料|佐证材料|supporting documents?)/i))m.push("证明材料");if(has(text,/(材料|documents?)/i)&&!m.length)m.push("材料");return m;}
function method(text:string){if(has(text,/(电子|邮件|email|online|上传|send)/i))return "电子提交";if(has(text,/(纸质|打印|paper|交到)/i))return "纸质提交";if(has(text,/(课程平台|platform)/i))return "课程平台提交";return null;}
function role(text:string,context:UserRoleContext,sourceIds:string[]):RoleBinding{
 let value:RoleBinding["role"]="unknown",label="";
 if(has(text,/(评审小组|评审成员|review group|review committee)/i)){value="review_group";label="评审小组";}
 else if(has(text,/(班委|班长|学习委员|class committee)/i)){value="class_committee";label="班委";}
 else if(has(text,/(教师|老师|teacher|instructor)/i)){value="teacher";label="教师";}
 else if(has(text,/(全体同学|所有同学|全体学生|all students|everyone)/i)){value="all_students";label="全体学生";}
 else if(has(text,/(申请学生|申请人|applying students?|applicants?)/i)){value="specific_students";label="申请学生";}
 else if(has(text,/(请你|本人|your\b)/i)){value="user";label="用户";}
 const applies=roleAppliesToUser({role:value,user_context:context,exact_user_match:value==="user"});
 const confidence=value==="unknown"?.4:applies===true?.92:applies===false?.86:.68;
 return {role:value,label,applies_to_user:applies,confidence,source_message_ids:sourceIds};
}
function actionCue(text:string){return has(text,/(完成|提交|发送|上交|交(?:作业|材料|申请表|报名表|费用)|报名|参加|填写|确认|核对|准备|submit|send|register|attend|complete|confirm|prepare)/i);}
function explicitActionIntent(message:NormalizedMessage){return explicitIntent(message)&&actionCue(message.text)&&!tentativeCue(message.text);}
function actionType(text:string):ActionDraft["action_type"]{if(has(text,/(报名|register)/i))return "register";if(has(text,/(参加|出席|attend)/i))return "attend";if(has(text,/(准备|prepare)/i))return "prepare";if(has(text,/(确认|核对|confirm)/i))return "confirm";if(has(text,/(提交|发送|上交|交(?:作业|材料|申请表|报名表|费用)|submit|send)/i))return "submit";if(has(text,/(完成|complete)/i))return "complete";return "other";}
function buildActions(messages:NormalizedMessage[],binding:RoleBinding):{actions:ActionDraft[];information:EventInformation[]}{
 const result:ActionDraft[]=[];const information:EventInformation[]=[];
 for(const message of messages){const text=message.text, due=deadline(text), isCue=actionCue(text)&&!tentativeCue(text);if(!isCue){information.push({text,confidence:normalizedMessageConfidence(message.confidence),source_message_ids:[message.id]});continue;}
  const actor=role(text,{user_id:message.user_id,identifiers:[],memberships:[],memberships_complete:false},[message.id]);
  const actionRole=binding.role!=="unknown"?binding:actor;
  if(actionRole.role==="review_group"&&actionRole.applies_to_user!==true){information.push({text,confidence:actionRole.confidence,source_message_ids:[message.id]});continue;}
  const aType=actionType(text), mat=materials(text), submit=method(text), title=[subject(text),aType==="submit"?"提交":aType==="register"?"报名":aType==="attend"?"参加":aType==="complete"?"完成":"确认"].join(" · ");
  const baseConfidence=Math.min(normalizedMessageConfidence(message.confidence),actionRole.confidence,due.value?due.confidence:.9);
  const confidence=explicitActionIntent(message)?Math.max(baseConfidence,.9):baseConfidence;
  result.push({user_id:message.user_id,action_type:aType,title,actor:actionRole,target_role:actionRole.role,target_label:actionRole.label,deadline:due.value,deadline_precision:due.precision,location:location(text),materials:mat,submission_method:submit,status:"proposed",source_message_ids:[message.id],confidence,confidence_breakdown:{normalization_confidence:normalizedMessageConfidence(message.confidence),classification_confidence:null,event_match_confidence:null,role_confidence:actionRole.confidence,entity_confidence:Math.max(due.confidence,location(text)?.length?.9:0,mat.length?.86:0),action_confidence:confidence,deadline_confidence:due.value?due.confidence:null},requires_confirmation:true});
 }
 return {actions:result,information};
}
function factors(messages:NormalizedMessage[],candidate:EventCandidateSnapshot):EventMatchFactors{
 const text=textOf(messages), topics=words(subject(text)), eventWords=words(`${candidate.event.title} ${candidate.event.summary}`), incomingDeadline=deadline(text).value, existingDeadlines=candidate.actions.map(action=>action.deadline).filter(Boolean) as string[], incomingLocation=location(text), existingLocations=candidate.actions.map(action=>action.location).filter(Boolean) as string[], incomingSender=messages.find(message=>message.sender)?.sender||"", existingIds=candidate.event.source_message_ids;
 const attachmentMatch=messages.some(message=>JSON.stringify(message.attachments)!=="[]"&&candidate.actions.some(action=>action.source_message_ids.includes(message.id)))?1:0;
 const sameSubject=subject(text).toLocaleLowerCase("en-US")===candidate.event.title.toLocaleLowerCase("en-US");
 return {topic_semantic:sameSubject?1:overlap(topics,eventWords),key_entity_overlap:sameSubject?.95:overlap(words(text),words(candidate.event.title+" "+candidate.actions.map(action=>action.materials.join(" ")).join(" "))),existing_event_continuity:candidate.event.event_type===classifyText(text).event_type?.95:.2,publisher_consistency:incomingSender&&candidate.event.summary.includes(incomingSender)?.9:sameSubject?.85:.45,deadline_compatibility:incomingDeadline&&existingDeadlines.includes(incomingDeadline)?.95:incomingDeadline&&existingDeadlines.length?.75:.42,attachment_evidence:attachmentMatch||sameSubject?.5:.3,temporal_proximity:.8,location_compatibility:incomingLocation&&existingLocations.includes(incomingLocation)?.95:incomingLocation&&existingLocations.length?.6:.42,source_corroboration:(new Set(messages.map(message=>message.source_type)).size>1||existingIds.length>1)?.7:.35};
}
const classification:ClassificationStage={async run({messages}){const detected=classifyText(textOf(messages));return stage({event_type:detected.event_type,tags:detected.tags,evidence_message_ids:ids(messages)},detected.confidence);}};
const matching:EventMatchingStage={async run({messages,existing_events}){if(!existing_events.length)return stage(decideEventMatch({has_existing_candidate:false,match_score:0,factors:{topic_semantic:0,key_entity_overlap:0,existing_event_continuity:0,publisher_consistency:0,deadline_compatibility:0,attachment_evidence:0,temporal_proximity:0,location_compatibility:0,source_corroboration:0}}),1);const scored=existing_events.map(candidate=>{const f=factors(messages,candidate), strong=hasStrongDuplicateEvidence({canonical_text_match:messages.some(message=>candidate.event.summary===message.text),attachment_fingerprint_match:false,official_reference_match:false,topic_similarity:f.topic_semantic,key_entity_overlap:f.key_entity_overlap});return {candidate,f,strong,score:scoreEventMatch({factors:f,strong_anchor:strong,explicit_update:explicitUpdate(textOf(messages)),hard_identity_conflict:false})};}).sort((a,b)=>b.score-a.score);const best=scored[0], runner=scored[1];return stage(decideEventMatch({has_existing_candidate:true,matched_event_id:best.candidate.event.id,match_score:best.score,runner_up_gap:runner?best.score-runner.score:1,strong_duplicate:best.strong,factors:best.f}),best.score);}};
const roles:RoleResolutionStage={async run({messages,user_context}){const detected=role(textOf(messages),user_context,ids(messages)),binding=detected.role==="unknown"&&messages.some(explicitActionIntent)?{role:"user" as const,label:"用户明确交办",applies_to_user:true,confidence:.95,source_message_ids:ids(messages)}:detected;return stage({actors:[binding]},binding.confidence,binding.role==="unknown"?[issue("role_unknown","No verified target role was found.",ids(messages))]:[]);}};
const extraction:EntityExtractionStage={async run({messages,roles}){const text=textOf(messages),due=deadline(text),place=location(text),mat=materials(text),submit=method(text),draft=buildActions(messages,roles.value.actors[0]);return stage({deadlines:due.value?[{value:due.value,confidence:due.confidence,source_message_ids:ids(messages)}]:[],locations:place?[{value:place,confidence:.87,source_message_ids:ids(messages)}]:[],materials:mat.length?[{value:mat,confidence:.86,source_message_ids:ids(messages)}]:[],submission_methods:submit?[{value:submit,confidence:.86,source_message_ids:ids(messages)}]:[],action_drafts:draft.actions,information:draft.information},average([due.value?due.confidence:.9,place?.9:.8,mat.length?.86:.8]),[]);}};
const conflicts:ConflictDetectionStage={async run({messages,match,entities,existing_events}){if(match.value.decision!=="merge_existing_event")return stage({state:"none",changes:[]},1);const existing=existing_events.find(item=>item.event.id===match.value.matched_event_id);if(!existing)return stage({state:"unresolved",changes:[]},0,[issue("matched_event_missing","Matched Event could not be loaded.",ids(messages))]);const changes:EventChangeDraft[]=[];for(const incoming of entities.value.action_drafts){const current=existing.actions.find(action=>action.action_type===incoming.action_type&&action.actor.role===incoming.actor.role&&action.submission_method===incoming.submission_method);if(!current)continue;for(const field of ["deadline","location","materials","submission_method","status"] as const){const currentValue=field==="materials"?current.materials:field==="submission_method"?current.submission_method:field==="deadline"?current.deadline:field==="location"?current.location:current.status;const incomingValue=field==="materials"?incoming.materials:field==="submission_method"?incoming.submission_method:field==="deadline"?incoming.deadline:field==="location"?incoming.location:incoming.status;if(JSON.stringify(currentValue)===JSON.stringify(incomingValue)||incomingValue===null)continue;const change=createEventChangeDraft({user_id:incoming.user_id,event_id:existing.event.id,action_id:current.id,field,current:{value:currentValue,authority:"unknown",explicit_update:false,verified_publisher_role:false,extraction_confidence:current.confidence,corroboration:.5,recency:.5,source_message_ids:current.source_message_ids},incoming:{value:incomingValue,authority:"unknown",explicit_update:explicitUpdate(textOf(messages)),verified_publisher_role:false,extraction_confidence:incoming.confidence,corroboration:.5,recency:1,source_message_ids:incoming.source_message_ids},from_version:existing.event.version});if(change)changes.push(change);}}
 const unresolved=changes.some(change=>change.resolution==="pending_review");return stage({state:unresolved?"unresolved":changes.length?"update_supported":"none",changes},unresolved?.5:.9,unresolved?[issue("conflict_unresolved","A canonical Event value conflicts with incoming evidence.",ids(messages))]:[]);}};
const review:ReviewDecisionStage={async run({messages,classification,match,roles,entities,conflicts}){const action=entities.value.action_drafts[0],binding=roles.value.actors[0];const breakdown:ConfidenceBreakdown={normalization_confidence:Math.min(...messages.map(message=>normalizedMessageConfidence(message.confidence))),classification_confidence:classification.confidence,event_match_confidence:match.value.decision==="create_new_event"?1:match.value.match_score,role_confidence:binding?.confidence??0,entity_confidence:entities.confidence,action_confidence:action?.confidence??0,deadline_confidence:action?.deadline?action.confidence_breakdown.deadline_confidence:null};const value=decideCandidate({has_action_cue:Boolean(action),is_information_only:!action,applies_to_user:binding?.applies_to_user??null,event_match_decision:match.value.decision,unresolved_conflict:conflicts.value.state==="unresolved",deadline_expected:Boolean(action?.deadline),confidence:breakdown});return stage(value,value.confidence,value.decision==="NEEDS_REVIEW"?value.reasons.map(reason=>issue(reason,reason,ids(messages))):[]);}};
const assembler:EventAssembler={async run({messages,classification,match,roles,entities,review}){const time=now(),existingId=match.value.matched_event_id;const confidence=Math.min(classification.confidence,review.confidence||1);const event:Event={id:existingId||crypto.randomUUID(),user_id:messages[0].user_id,event_type:classification.value.event_type,tags:classification.value.tags,title:subject(textOf(messages)),summary:textOf(messages),status:review.value.decision==="NEEDS_REVIEW"?"needs_review":"active",source_message_ids:ids(messages),participants:roles.value.actors as EventParticipant[],information:entities.value.information,version:1,decision:review.value.decision,confidence,confidence_breakdown:{normalization_confidence:Math.min(...messages.map(message=>normalizedMessageConfidence(message.confidence))),classification_confidence:classification.confidence,event_match_confidence:match.value.match_score,role_confidence:roles.confidence,entity_confidence:entities.confidence,action_confidence:null,deadline_confidence:entities.value.deadlines[0]?.confidence??null},created_at:time,updated_at:time};return stage(event,confidence);}};
const generator:ActionGenerator={async run({event,entities}){const time=now();const actions=entities.value.action_drafts.map(draft=>({...draft,id:crypto.randomUUID(),event_id:event.id,created_at:time,updated_at:time,confidence_breakdown:{...draft.confidence_breakdown,event_match_confidence:event.confidence_breakdown.event_match_confidence,classification_confidence:event.confidence_breakdown.classification_confidence},requires_confirmation:true}));return stage(actions,actions.length?Math.min(...actions.map(action=>action.confidence)):1);}};
const projector:CandidateTaskProjector={async run({event,actions}){return stage(actions.filter(action=>action.actor.applies_to_user===true).map(action=>({id:`candidate:${action.id}`,user_id:action.user_id,event_id:event.id,action_id:action.id,title:action.title,deadline:action.deadline,location:action.location,status:"candidate",source_message_ids:action.source_message_ids,requires_confirmation:true})),1);}};

export function createEventEngine(){const stages:EventEngineStages={classification,event_matching:matching,role_resolution:roles,entity_extraction:extraction,conflict_detection:conflicts,review_decision:review,event_assembler:assembler,action_generator:generator,candidate_task_projector:projector};return new EventEngineService(stages,DEFAULT_EVENT_ENGINE_CONFIG);}
export function defaultUserRoleContext(user_id:string):UserRoleContext{return {user_id,identifiers:[],memberships:[{role:"student",label:"学生账号",verified:true}],memberships_complete:false};}
export function actionKey(action:Action){return actionIdentityKey({event_id:action.event_id,action_type:action.action_type,actor_role:action.actor.role,deadline:action.deadline,materials:action.materials,submission_method:action.submission_method});}
