import { env } from "cloudflare:workers";
import { importMessages } from "@/lib/importer";
import { digest } from "@/lib/security";
import { createInboxItem, database, updateInboxItem } from "@/lib/storage";
import {
  callbackDedupKey,
  decryptWeComPayload,
  encryptedXml,
  parseWeComMessage,
  planWeComDelivery,
  publicRequestId,
  validateCallbackClock,
  verifyMessageSignature,
  type WeComConfig,
  type WeComMessage,
} from "@/lib/wecom";
import { consumeWeComBindingChallenge, setWeComBindingReplayStatus } from "@/lib/wecom-identity";

export const dynamic="force-dynamic";
const MAX_CALLBACK_BYTES=1_000_000;

type CallbackStatus="processing"|"pending_mapping"|"processed"|"needs_review"|"unsupported"|"failed";

function config():WeComConfig{
 const values={
  corpId:env.WECHAT_CORP_ID?.trim()||"",agentId:env.WECHAT_AGENT_ID?.trim()||"",
  secret:env.WECHAT_SECRET?.trim()||"",token:env.WECHAT_TOKEN?.trim()||"",
  encodingAesKey:env.WECHAT_ENCODING_AES_KEY?.trim()||"",
 };
 if(Object.values(values).some(value=>!value))throw new Error("wecom_not_configured");
 return values;
}

function plain(value:string,status=200,headers:Record<string,string>={}){
 return new Response(value,{status,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff",...headers}});
}

function callbackParams(request:Request){
 const url=new URL(request.url);
 return {timestamp:url.searchParams.get("timestamp")||"",nonce:url.searchParams.get("nonce")||"",signature:url.searchParams.get("msg_signature")||""};
}

async function body(request:Request){
 const value=await request.text();
 if(!value||value.length>MAX_CALLBACK_BYTES)throw new Error("invalid_callback_body");
 return value;
}

async function authenticate(request:Request,encrypted:string,wecom:WeComConfig){
 const {timestamp,nonce,signature}=callbackParams(request);
 validateCallbackClock(timestamp,nonce);
 if(!/^[a-f0-9]{40}$/i.test(signature)||!await verifyMessageSignature(wecom.token,timestamp,nonce,encrypted,signature))throw new Error("invalid_signature");
 return decryptWeComPayload(encrypted,wecom.encodingAesKey,wecom.corpId);
}

async function updateCallback(id:string,status:CallbackStatus,fields:{mappingStatus?:string;inboxItemId?:string;errorCode?:string}={}){
 await database().prepare("UPDATE wecom_callbacks SET status=?,mapping_status=COALESCE(?,mapping_status),inbox_item_id=COALESCE(?,inbox_item_id),error_code=?,updated_at=? WHERE id=?")
  .bind(status,fields.mappingStatus??null,fields.inboxItemId??null,fields.errorCode||"",new Date().toISOString(),id).run();
}

async function processMappedCallback(id:string,dedupKey:string,message:WeComMessage,internalUserId:string){
 const plan=planWeComDelivery(message,internalUserId);if(plan.kind==="pending_mapping")throw new Error("missing_mapping");
 let inboxItemId="";
 try{
  if(plan.kind==="import_text"){
   const metadata={provider:"wecom",externalMessageId:message.msgId,externalSender:message.fromUserName,agentId:message.agentId,messageType:message.msgType,timestamp:message.createTime};
   const inbox=await createInboxItem({user_id:plan.userId,source_type:"wecom",source_reference:`wecom:${message.msgId||publicRequestId(dedupKey)}`,original_text:plan.text,processing_status:"received",metadata});
   inboxItemId=inbox.id;await importMessages(plan.userId,plan.text,"企业微信","wecom",{existingInboxId:inbox.id,metadata});
   await updateCallback(id,"processed",{mappingStatus:"mapped",inboxItemId:inbox.id});return;
  }
  if(plan.kind==="store_attachment"){
   const inbox=await createInboxItem({user_id:plan.userId,source_type:"wecom",source_reference:`wecom:${message.msgId||publicRequestId(dedupKey)}`,original_text:"",processing_status:plan.status,metadata:{provider:"wecom",externalMessageId:message.msgId,externalSender:message.fromUserName,messageType:message.msgType,timestamp:message.createTime,attachments:[plan.attachment]}});
   await updateCallback(id,"needs_review",{mappingStatus:"mapped",inboxItemId:inbox.id});return;
  }
  await updateCallback(id,"unsupported",{mappingStatus:"mapped",errorCode:plan.reason});
 }catch{
  if(inboxItemId)try{await updateInboxItem(inboxItemId,internalUserId,"failed",{failureReason:"WeCom downstream processing failed"});}catch{}
  await updateCallback(id,"failed",{mappingStatus:"mapped",inboxItemId,errorCode:inboxItemId?"downstream_failure":"inbox_write_failure"});
 }
}

async function replayPendingCallbacks(externalUserId:string,internalUserId:string,wecom:WeComConfig,challengeId:string){
 const rows=await database().prepare("SELECT id,dedup_key AS dedupKey,encrypted_payload AS encryptedPayload FROM wecom_callbacks WHERE external_user_id=? AND status='pending_mapping' ORDER BY created_at").bind(externalUserId).all<{id:string;dedupKey:string;encryptedPayload:string}>();
 try{for(const row of rows.results){try{const message=parseWeComMessage(await decryptWeComPayload(row.encryptedPayload,wecom.encodingAesKey,wecom.corpId));if(message.fromUserName!==externalUserId)throw new Error("sender_mismatch");await processMappedCallback(row.id,row.dedupKey,message,internalUserId);}catch{await updateCallback(row.id,"failed",{mappingStatus:"mapped",errorCode:"replay_processing_failure"});}}await setWeComBindingReplayStatus(challengeId,"completed");return rows.results.length;}catch(error){await setWeComBindingReplayStatus(challengeId,"failed");throw error;}
}

async function receiveCallback(message:WeComMessage,encrypted:string,wecom:WeComConfig){
 const db=database(),dedupKey=await callbackDedupKey(message,encrypted),id=crypto.randomUUID(),now=new Date().toISOString();
 const inserted=await db.prepare("INSERT OR IGNORE INTO wecom_callbacks (id,dedup_key,message_id,external_user_id,message_type,encrypted_payload,status,mapping_status,inbox_item_id,error_code,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
  .bind(id,dedupKey,message.msgId,message.fromUserName,message.msgType,encrypted,"processing","unknown","","",now,now).run();
 if((inserted.meta.changes||0)===0)return {duplicate:true,requestId:publicRequestId(dedupKey)};

 const binding=await consumeWeComBindingChallenge(message.fromUserName,message.content);
 if(binding?.accepted){await updateCallback(id,"processed",{mappingStatus:"mapped",errorCode:"binding_confirmation"});await replayPendingCallbacks(message.fromUserName,binding.userId,wecom,binding.challengeId);return {duplicate:false,requestId:publicRequestId(dedupKey)};}
 if(binding&&!binding.accepted){await updateCallback(id,"unsupported",{mappingStatus:"unknown",errorCode:binding.reason});return {duplicate:false,requestId:publicRequestId(dedupKey)};}
 const mapping=await db.prepare("SELECT internal_user_id AS internalUserId FROM external_identities WHERE provider='wecom' AND external_user_id=? AND verification_status='verified'")
  .bind(message.fromUserName).first<{internalUserId:string}>();
 const internalUserId=mapping?.internalUserId||"",plan=planWeComDelivery(message,internalUserId);
 if(plan.kind==="pending_mapping"){await updateCallback(id,"pending_mapping",{mappingStatus:"unknown"});return {duplicate:false,requestId:publicRequestId(dedupKey)};}
 await processMappedCallback(id,dedupKey,message,internalUserId);return {duplicate:false,requestId:publicRequestId(dedupKey)};
}

async function retainDecryptFailure(encrypted:string){
 const db=database(),dedupKey=`cipher:${await digest(encrypted)}`,now=new Date().toISOString();
 await db.prepare("INSERT OR IGNORE INTO wecom_callbacks (id,dedup_key,message_id,external_user_id,message_type,encrypted_payload,status,mapping_status,inbox_item_id,error_code,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
  .bind(crypto.randomUUID(),dedupKey,"","","",encrypted,"failed","unknown","","decrypt_failure",now,now).run();
}

function publicError(error:unknown){
 const code=error instanceof Error?error.message:"callback_failure";
 if(code==="invalid_signature")return plain("invalid signature",401);
 if(code==="invalid_timestamp"||code==="invalid_nonce")return plain("invalid callback time",400);
 if(code==="wecom_not_configured")return plain("callback unavailable",503);
 return plain("invalid callback",400);
}

export async function GET(request:Request){
 try{
  const wecom=config(),echo=new URL(request.url).searchParams.get("echostr")||"";
  if(!echo)throw new Error("missing_echostr");
  return plain(await authenticate(request,echo,wecom));
 }catch(error){return publicError(error);}
}

export async function POST(request:Request){
 let encrypted="",signatureAccepted=false;
 try{
  const wecom=config(),xml=await body(request);encrypted=encryptedXml(xml);
  if(!encrypted)throw new Error("missing_encrypted_payload");
  const {timestamp,nonce,signature}=callbackParams(request);validateCallbackClock(timestamp,nonce);
  if(!/^[a-f0-9]{40}$/i.test(signature)||!await verifyMessageSignature(wecom.token,timestamp,nonce,encrypted,signature))throw new Error("invalid_signature");
  signatureAccepted=true;
  const decrypted=await decryptWeComPayload(encrypted,wecom.encodingAesKey,wecom.corpId),message=parseWeComMessage(decrypted);
  if(!message.fromUserName||!message.msgType)throw new Error("invalid_message");
  if(message.agentId&&message.agentId!==wecom.agentId)throw new Error("invalid_agent");
  const result=await receiveCallback(message,encrypted,wecom);
  return plain("success",200,{"X-WeCom-Request-Id":result.requestId,...(result.duplicate?{"X-WeCom-Duplicate":"1"}:{})});
 }catch(error){
  if(signatureAccepted&&encrypted&&(error instanceof Error)&&(error.message==="decrypt_failure"||error.message==="receiver_mismatch")){
   try{await retainDecryptFailure(encrypted);}catch{}
  }
  return publicError(error);
 }
}
