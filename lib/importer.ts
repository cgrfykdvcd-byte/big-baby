import { chinaDate } from './campus';
import { eventEngineInput, type ContentLanguagePreference, type InboxItem, type InboxSourceType } from './inbox';
import { createInboxItem, database, normalizeAndStore, updateInboxItem } from './storage';
import { processNormalizedMessages } from './event-engine-store';
import type { Action } from './event-engine';

type ImportOptions={reference?:string;sourceReference?:string;mode?:string;fileId?:string;contentLanguage?:ContentLanguagePreference;existingInboxId?:string;metadata?:Record<string,unknown>};

export type ImportedEventOutcome={
 event_id:string;
 decision:"AUTO_CANDIDATE"|"NEEDS_REVIEW"|"INFORMATION_ONLY";
 review_reasons:string[];
 candidate_action_ids:string[];
};

// Event/Action are the source of truth. Candidate entries are written only by the
// Action projector, so legacy Inbox UI cannot create independent task semantics.
export async function importMessages(userId:string,text:string,source:string,sourceType:InboxSourceType,options:ImportOptions={}){
 const reference=options.reference||chinaDate(),contentLanguage=options.contentLanguage||'original';
 let item:InboxItem;
 if(options.existingInboxId){
  await updateInboxItem(options.existingInboxId,userId,'processing',{originalText:text,metadata:options.metadata||{}});
  item={id:options.existingInboxId,user_id:userId,source_type:sourceType,source_reference:options.sourceReference||options.fileId||source,original_text:text,original_language:'unknown',processing_status:'processing',metadata:options.metadata||{},created_at:new Date().toISOString()};
 }else item=await createInboxItem({user_id:userId,source_type:sourceType,source_reference:options.sourceReference||options.fileId||source,original_text:text,processing_status:'received',metadata:options.metadata||{}});
 try{
  await updateInboxItem(item.id,userId,'processing');
  const normalized=await normalizeAndStore(item),messages=eventEngineInput(normalized);
  const outcomes=await processNormalizedMessages(userId,messages);
  const created=outcomes.filter(outcome=>outcome.stored.created).length;
  const review=outcomes.some(outcome=>outcome.result.review.value.decision==='NEEDS_REVIEW');
  const db=database();
  await updateInboxItem(item.id,userId,review?'needs_review':'ready');
  await db.prepare('INSERT INTO analysis_runs (id,user_id,kind,engine,count,warnings,created_at) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),userId,sourceType,'event-engine-v2',created,JSON.stringify(review?['needs_review']:[]),new Date().toISOString()).run();
  const eventOutcomes:ImportedEventOutcome[]=outcomes.map(outcome=>({
   event_id:outcome.stored.event.id,
   decision:outcome.result.review.value.decision,
   review_reasons:outcome.result.review.value.reasons,
   candidate_action_ids:outcome.stored.actions
    .filter((action:Action)=>action.actor.applies_to_user===true&&action.status!=="dismissed")
    .map((action:Action)=>action.id),
  }));
  return {engine:'event-engine-v2',warnings:review?['needs_review']:[],created,duplicates:messages.length-created,inboxItemId:item.id,normalized:messages.length,reference,contentLanguage,eventOutcomes};
 }catch(error){await updateInboxItem(item.id,userId,'failed',{failureReason:error instanceof Error?error.message:'Normalization failed'});throw error;}
}
