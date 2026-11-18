import { database } from "./storage";
import { importMessages, type ImportedEventOutcome } from "./importer";
import { digest, HttpError, randomToken } from "./security";

export const CHATGPT_PROVIDER="chatgpt" as const;
export const HANDOFF_CATEGORIES=["assignment","exam","competition","registration","material","meeting","errand","administrative","other"] as const;
export type ChatGptHandoffCategory=(typeof HANDOFF_CATEGORIES)[number];

export type ChatGptHandoffInput={
 original_text:string;
 explicit_intent:boolean;
 category?:ChatGptHandoffCategory;
 title?:string;
 deadline?:string;
 location?:string;
 materials?:string[];
 source_reference?:string;
 metadata?:Record<string,string|number|boolean|null>;
};

type CredentialRow={id:string;userId:string;status:string;createdAt:string;revokedAt:string|null;lastUsedAt:string|null};
type ReceiptRow={id:string;inboxItemId:string;status:string;resultJson:string};
export type ChatGptCredential={id:string;provider:typeof CHATGPT_PROVIDER;status:string;created_at:string;revoked_at:string|null;last_used_at:string|null};
export type HandoffResult={inbox_item_id:string;event_id:string|null;decision:string|null;review_reasons:string[];candidate_action_ids:string[]};

const asCredential=(row:CredentialRow):ChatGptCredential=>({id:row.id,provider:CHATGPT_PROVIDER,status:row.status,created_at:row.createdAt,revoked_at:row.revokedAt,last_used_at:row.lastUsedAt});
const parseResult=(value:string):HandoffResult=>{try{return JSON.parse(value) as HandoffResult}catch{return {inbox_item_id:"",event_id:null,decision:null,review_reasons:[],candidate_action_ids:[]}}};
const now=()=>new Date().toISOString();

export async function listChatGptCredentials(userId:string){
 const rows=await database().prepare("SELECT id,user_id AS userId,status,created_at AS createdAt,revoked_at AS revokedAt,last_used_at AS lastUsedAt FROM external_integration_credentials WHERE user_id=? AND provider=? ORDER BY created_at DESC").bind(userId,CHATGPT_PROVIDER).all<CredentialRow>();
 return rows.results.map(asCredential);
}

export async function createChatGptCredential(userId:string):Promise<{credential:ChatGptCredential;access_token:string}>{
 const db=database(),id=crypto.randomUUID(),accessToken=randomToken(),createdAt=now();
 await db.prepare("INSERT INTO external_integration_credentials (id,provider,user_id,secret_hash,status,created_at,revoked_at,last_used_at) VALUES (?,?,?,?,?,?,?,?)").bind(id,CHATGPT_PROVIDER,userId,await digest(accessToken),"active",createdAt,null,null).run();
 return {credential:{id,provider:CHATGPT_PROVIDER,status:"active",created_at:createdAt,revoked_at:null,last_used_at:null},access_token:accessToken};
}

export async function revokeChatGptCredential(userId:string,credentialId:string){
 const result=await database().prepare("UPDATE external_integration_credentials SET status='revoked',revoked_at=? WHERE id=? AND user_id=? AND provider=? AND status='active'").bind(now(),credentialId,userId,CHATGPT_PROVIDER).run();
 if(!result.meta.changes)throw new HttpError("未找到可撤销的 ChatGPT 集成凭据。",404);
}

export async function authenticateChatGptCredential(accessToken:string){
 if(!/^[a-f0-9]{64}$/.test(accessToken))throw new HttpError("ChatGPT 集成凭据无效。",401);
 const db=database(),row=await db.prepare("SELECT id,user_id AS userId,status,created_at AS createdAt,revoked_at AS revokedAt,last_used_at AS lastUsedAt FROM external_integration_credentials WHERE provider=? AND secret_hash=?").bind(CHATGPT_PROVIDER,await digest(accessToken)).first<CredentialRow>();
 if(!row||row.status!=="active")throw new HttpError("ChatGPT 集成不可用或已撤销。",401);
 await db.prepare("UPDATE external_integration_credentials SET last_used_at=? WHERE id=? AND status='active'").bind(now(),row.id).run();
 return row;
}

function metadataForHandoff(input:ChatGptHandoffInput,credentialId:string,requestId:string):Record<string,unknown>{
 const exactDeadline=Boolean(input.deadline&&/^20\d{2}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?$/.test(input.deadline));
 return {
  integration:{provider:CHATGPT_PROVIDER,credential_id:credentialId,request_id:requestId,explicit_intent:input.explicit_intent},
  handoff_hints:{category:input.category||"other",title:input.title||null,deadline:input.deadline||null,deadline_confidence:input.deadline?(exactDeadline?"high":"low"):null,location:input.location||null,materials:input.materials||[]},
  ...(input.metadata?{integration_metadata:input.metadata}:{}),
 };
}

function outcomeResult(inboxItemId:string,outcomes:ImportedEventOutcome[]):HandoffResult{
 const first=outcomes[0];
 return {inbox_item_id:inboxItemId,event_id:first?.event_id||null,decision:first?.decision||null,review_reasons:[...new Set(outcomes.flatMap(outcome=>outcome.review_reasons))],candidate_action_ids:[...new Set(outcomes.flatMap(outcome=>outcome.candidate_action_ids))]};
}

export async function handoffFromChatGpt(credential:CredentialRow,input:ChatGptHandoffInput,requestId:string):Promise<{duplicate:boolean;processing:boolean;result:HandoffResult}>{
 const db=database();
 const existing=await db.prepare("SELECT id,inbox_item_id AS inboxItemId,status,result_json AS resultJson FROM external_integration_receipts WHERE credential_id=? AND external_request_id=?").bind(credential.id,requestId).first<ReceiptRow>();
 if(existing)return {duplicate:true,processing:existing.status==="processing",result:parseResult(existing.resultJson)};
 const receiptId=crypto.randomUUID(),createdAt=now();
 await db.prepare("INSERT OR IGNORE INTO external_integration_receipts (id,credential_id,external_request_id,inbox_item_id,status,result_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").bind(receiptId,credential.id,requestId,"","processing","{}",createdAt,createdAt).run();
 const receipt=await db.prepare("SELECT id,inbox_item_id AS inboxItemId,status,result_json AS resultJson FROM external_integration_receipts WHERE credential_id=? AND external_request_id=?").bind(credential.id,requestId).first<ReceiptRow>();
 if(!receipt||receipt.id!==receiptId)return {duplicate:true,processing:receipt?.status==="processing",result:parseResult(receipt?.resultJson||"{}")};
 try{
  const report=await importMessages(credential.userId,input.original_text,"ChatGPT handoff","chatgpt",{
   sourceReference:input.source_reference,
   metadata:metadataForHandoff(input,credential.id,requestId),
  });
  const result=outcomeResult(report.inboxItemId,report.eventOutcomes);
  await db.prepare("UPDATE external_integration_receipts SET inbox_item_id=?,status='completed',result_json=?,updated_at=? WHERE id=? AND credential_id=?").bind(result.inbox_item_id,JSON.stringify(result),now(),receiptId,credential.id).run();
  return {duplicate:false,processing:false,result};
 }catch(error){
  await db.prepare("UPDATE external_integration_receipts SET status='failed',updated_at=? WHERE id=? AND credential_id=?").bind(now(),receiptId,credential.id).run();
  throw error;
 }
}
