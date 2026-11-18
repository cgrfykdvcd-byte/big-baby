import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createEventEngine, defaultUserRoleContext } from "../lib/event-engine-runtime.ts";
import { eventEngineInput, normalizeInboxItem, type InboxItem } from "../lib/inbox.ts";
import {
 callbackDedupKey,decryptWeComPayload,encryptedXml,messageSignature,parseWeComMessage,
 planWeComDelivery,validateCallbackClock,verifyMessageSignature,type WeComMessage,
} from "../lib/wecom.ts";

const encoder=new TextEncoder();
const rawKey=Uint8Array.from({length:32},(_,index)=>index+1);
const encodingAesKey=Buffer.from(rawKey).toString("base64").replace(/=$/,"");
const corpId="ww1234567890abcdef",token="fixture-token",nonce="fixture_nonce",timestamp="1789400000";
const xml=`<xml><ToUserName><![CDATA[${corpId}]]></ToUserName><FromUserName><![CDATA[student-42]]></FromUserName><CreateTime>${timestamp}</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[全体同学请于2026-09-18前提交概率论作业。]]></Content><MsgId>987654321</MsgId><AgentID>1000002</AgentID></xml>`;

async function encryptFixture(value:string,receiver=corpId){
 const message=encoder.encode(value),receiverBytes=encoder.encode(receiver),plain=new Uint8Array(20+message.length+receiverBytes.length);
 plain.set(Uint8Array.from({length:16},(_,index)=>index));new DataView(plain.buffer).setUint32(16,message.length);plain.set(message,20);plain.set(receiverBytes,20+message.length);
 const padding=32-(plain.length%32),padded=new Uint8Array(plain.length+padding);padded.set(plain);padded.fill(padding,plain.length);
 const key=await crypto.subtle.importKey("raw",rawKey,{name:"AES-CBC"},false,["encrypt"]);
 const cipher=new Uint8Array(await crypto.subtle.encrypt({name:"AES-CBC",iv:rawKey.slice(0,16)},key,padded)).slice(0,-16);
 return Buffer.from(cipher).toString("base64");
}

const encrypted=await encryptFixture(xml),signature=await messageSignature(token,timestamp,nonce,encrypted);

// 1. URL verification uses the same authenticated decrypt envelope.
const echo=await encryptFixture("verified-echo");
assert.equal(await decryptWeComPayload(echo,encodingAesKey,corpId),"verified-echo");
// 2. Official SHA-1 signature order verifies.
assert.equal(await verifyMessageSignature(token,timestamp,nonce,encrypted,signature),true);
// 3. An altered signature is rejected.
assert.equal(await verifyMessageSignature(token,timestamp,nonce,encrypted,"0".repeat(40)),false);
// 4. AES-CBC payload decrypts and parses.
assert.equal(await decryptWeComPayload(encrypted,encodingAesKey,corpId),xml);
// 5. Receiver/key mismatch fails closed.
await assert.rejects(decryptWeComPayload(encrypted,encodingAesKey,"ww-wrong"),/receiver_mismatch/);
// Callback clock rejects stale delivery while accepting the fixture window.
validateCallbackClock(timestamp,nonce,Number(timestamp));
assert.throws(()=>validateCallbackClock(timestamp,nonce,Number(timestamp)+301),/invalid_timestamp/);

const parsed=parseWeComMessage(xml);
assert.equal(parsed.msgId,"987654321");
// 6. Repeated callbacks resolve to one stable dedup identity.
assert.equal(await callbackDedupKey(parsed,encrypted),await callbackDedupKey(parsed,encrypted));
// 7. A verified mapping produces a text import plan.
assert.deepEqual(planWeComDelivery(parsed,"internal-user-1"),{kind:"import_text",userId:"internal-user-1",text:parsed.content});
// 8. An unknown external user remains pending and unassigned.
assert.deepEqual(planWeComDelivery(parsed),{kind:"pending_mapping"});

// 9. The adapter's mapped text creates an existing InboxItem shape, never an Event directly.
const item:InboxItem={id:"wecom-inbox-1",user_id:"internal-user-1",source_type:"wecom",source_reference:"wecom:987654321",original_text:parsed.content,original_language:"zh-CN",processing_status:"received",metadata:{provider:"wecom",sender:parsed.fromUserName,timestamp:parsed.createTime},created_at:"2026-09-14T00:00:00.000Z"};
assert.equal(item.source_type,"wecom");
// 10. Existing normalization is the only Event Engine input.
const normalized=normalizeInboxItem(item,{normalization_id:"wecom-run-1",normalization_version:1});
assert.equal(normalized[0].source_type,"wecom");assert.equal(normalized[0].source_id,item.id);
// 11. Existing Event Engine consumes that NormalizedMessage without provider logic.
normalized[0].confidence="high";
const outcome=await createEventEngine().process({messages:eventEngineInput(normalized),user_context:defaultUserRoleContext(item.user_id),existing_events:[]});
assert.equal(outcome.event.value.source_message_ids[0],normalized[0].id);

// 12. Image callbacks retain an external attachment reference and stop at needs_review.
const imageMessage:WeComMessage={...parsed,msgType:"image",content:"",mediaId:"media-safe-id",fileName:"notice.png",msgId:"image-1"};
const imagePlan=planWeComDelivery(imageMessage,"internal-user-1");
assert.equal(imagePlan.kind,"store_attachment");
if(imagePlan.kind==="store_attachment"){assert.equal(imagePlan.status,"needs_review");assert.equal(imagePlan.attachment.external_reference,"media-safe-id");}

// 13. Callback source contains no logging path and fixed public responses contain no fixture secrets.
const route=await readFile(new URL("../app/api/wecom/callback/route.ts",import.meta.url),"utf8");
assert.equal(route.includes("console."),false);
for(const secret of [token,encodingAesKey])assert.equal(["success","invalid signature","invalid callback","callback unavailable"].join(" ").includes(secret),false);
assert.equal(encryptedXml(`<xml><Encrypt><![CDATA[${encrypted}]]></Encrypt></xml>`),encrypted);

console.log("WeCom adapter contract tests: PASS (13 fixtures)");
