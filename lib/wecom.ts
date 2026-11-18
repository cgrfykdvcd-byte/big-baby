const encoder=new TextEncoder(),decoder=new TextDecoder();

export type WeComMessage={
 toUserName:string;fromUserName:string;createTime:string;msgType:string;msgId:string;
 content:string;mediaId:string;fileName:string;agentId:string;
};

export type WeComConfig={corpId:string;agentId:string;secret:string;token:string;encodingAesKey:string};
export type WeComDeliveryPlan=
 |{kind:"pending_mapping"}
 |{kind:"import_text";userId:string;text:string}
 |{kind:"store_attachment";userId:string;status:"needs_review";attachment:{id:string;filename:string;mime_type:string;provider:"wecom";external_reference:string}}
 |{kind:"unsupported";reason:"empty_text"|"unsupported_message_type"};

const bytes=(value:string)=>Uint8Array.from(atob(value),char=>char.charCodeAt(0));
const hex=(value:ArrayBuffer)=>Array.from(new Uint8Array(value),byte=>byte.toString(16).padStart(2,"0")).join("");

function xmlValue(xml:string,name:string){
 const match=xml.match(new RegExp(`<${name}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${name}>`));
 return (match?.[1]??match?.[2]??"").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&apos;/g,"'").trim();
}

export function encryptedXml(xml:string){return xmlValue(xml,"Encrypt")}

export function parseWeComMessage(xml:string):WeComMessage{return {
 toUserName:xmlValue(xml,"ToUserName"),fromUserName:xmlValue(xml,"FromUserName"),createTime:xmlValue(xml,"CreateTime"),
 msgType:xmlValue(xml,"MsgType").toLowerCase(),msgId:xmlValue(xml,"MsgId"),content:xmlValue(xml,"Content"),
 mediaId:xmlValue(xml,"MediaId"),fileName:xmlValue(xml,"FileName"),agentId:xmlValue(xml,"AgentID"),
}}

export function validateCallbackClock(timestamp:string,nonce:string,nowSeconds=Math.floor(Date.now()/1000)){
 if(!/^\d{10}$/.test(timestamp)||Math.abs(Number(timestamp)-nowSeconds)>300)throw new Error("invalid_timestamp");
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(nonce))throw new Error("invalid_nonce");
}

export async function messageSignature(token:string,timestamp:string,nonce:string,encrypted:string){
 return hex(await crypto.subtle.digest("SHA-1",encoder.encode([token,timestamp,nonce,encrypted].sort().join(""))));
}

export async function verifyMessageSignature(token:string,timestamp:string,nonce:string,encrypted:string,signature:string){
 const expected=await messageSignature(token,timestamp,nonce,encrypted);if(expected.length!==signature.length)return false;
 let mismatch=0;for(let index=0;index<expected.length;index++)mismatch|=expected.charCodeAt(index)^signature.charCodeAt(index);return mismatch===0;
}

function aesKey(encodingAesKey:string){
 if(!/^[A-Za-z0-9+/]{43}$/.test(encodingAesKey))throw new Error("invalid_aes_key");
 const raw=bytes(encodingAesKey+"=");if(raw.length!==32)throw new Error("invalid_aes_key");
 return {raw,key:crypto.subtle.importKey("raw",raw,{name:"AES-CBC"},false,["encrypt","decrypt"])};
}

// WeCom uses PKCS#7 with a 32-byte block. WebCrypto's AES-CBC removes 16-byte
// padding, so append one synthetic valid block and retain WeCom's own padding.
async function decryptRaw(cipher:Uint8Array,encodingAesKey:string){
 if(!cipher.length||cipher.length%16)throw new Error("invalid_ciphertext");
 const {raw,key}=aesKey(encodingAesKey),last=cipher.slice(-16),padding=new Uint8Array(16).fill(16);
 const extra=new Uint8Array(await crypto.subtle.encrypt({name:"AES-CBC",iv:last},await key,padding)).slice(0,16);
 const augmented=new Uint8Array(cipher.length+16);augmented.set(cipher);augmented.set(extra,cipher.length);
 return new Uint8Array(await crypto.subtle.decrypt({name:"AES-CBC",iv:raw.slice(0,16)},await key,augmented));
}

export async function decryptWeComPayload(encrypted:string,encodingAesKey:string,corpId:string){
 let plain:Uint8Array;try{plain=await decryptRaw(bytes(encrypted),encodingAesKey)}catch{throw new Error("decrypt_failure")}
 const padding=plain.at(-1)||0;if(padding<1||padding>32||plain.slice(-padding).some(byte=>byte!==padding))throw new Error("decrypt_failure");
 plain=plain.slice(0,-padding);if(plain.length<20)throw new Error("decrypt_failure");
 const length=new DataView(plain.buffer,plain.byteOffset+16,4).getUint32(0);if(length>plain.length-20)throw new Error("decrypt_failure");
 const message=decoder.decode(plain.slice(20,20+length)),receiver=decoder.decode(plain.slice(20+length));
 if(receiver!==corpId)throw new Error("receiver_mismatch");return message;
}

export async function callbackDedupKey(message:WeComMessage,encrypted:string){
 if(message.msgId)return `msg:${message.msgId}`;
 return `fallback:${hex(await crypto.subtle.digest("SHA-256",encoder.encode([message.fromUserName,message.createTime,message.msgType,message.mediaId,message.content,encrypted].join("\u0000"))))}`;
}

export function planWeComDelivery(message:WeComMessage,internalUserId?:string):WeComDeliveryPlan{
 if(!internalUserId)return {kind:"pending_mapping"};
 if(message.msgType==="text")return message.content?{kind:"import_text",userId:internalUserId,text:message.content}:{kind:"unsupported",reason:"empty_text"};
 if(message.msgType==="image"||message.msgType==="file")return {kind:"store_attachment",userId:internalUserId,status:"needs_review",attachment:{id:`wecom:${message.mediaId}`,filename:message.fileName||"",mime_type:message.msgType==="image"?"image/*":"application/octet-stream",provider:"wecom",external_reference:message.mediaId}};
 return {kind:"unsupported",reason:"unsupported_message_type"};
}

export function publicRequestId(dedupKey:string){return dedupKey.replace(/[^A-Za-z0-9:_-]/g,"").slice(0,96)}
