export type InboxSourceType = "text" | "image" | "file" | "schedule" | "wecom" | "chatgpt";
export type InboxProcessingStatus = "received" | "processing" | "needs_review" | "ready" | "failed";
export type MessageLanguage = "zh-CN" | "en-US" | "mixed" | "unknown";
export type ContentLanguagePreference = "original" | "zh" | "en";

export type InboxItem = {
  id:string; user_id:string; source_type:InboxSourceType; source_reference:string;
  original_text:string; original_language:MessageLanguage; processing_status:InboxProcessingStatus;
  metadata:Record<string,unknown>; created_at:string;
};

export type NormalizedMessage = {
  id:string; user_id:string; source_type:InboxSourceType; source_id:string; text:string;
  language:MessageLanguage; timestamp:string; sender:string; attachments:unknown[];
  metadata:Record<string,unknown>; confidence:"high"|"medium"|"low";
  // Evidence is immutable. A later normalization creates a new run/version
  // instead of replacing this record (and therefore never breaks Event links).
  inbox_item_id:string; normalization_id:string; normalization_version:number;
};

export type NormalizationIdentity = { normalization_id:string; normalization_version:number };

const chinese=/[\u3400-\u9fff]/g;
const latin=/[A-Za-z]+(?:[’-][A-Za-z]+)*/g;
const boilerplate=/^(please note that|this is to inform you|students are required to|dear students[,：:]?)/i;

function words(text:string){return text.match(latin)||[]}
function metadataObject(value:unknown):Record<string,unknown>{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}}

export function detectLanguage(text:string):MessageLanguage {
  const han=(text.match(chinese)||[]).length, english=words(text).length;
  if(!han&&!english)return "unknown";
  if(han&&english)return "mixed";
  return han?"zh-CN":"en-US";
}

export function normalizeInboxItem(item:InboxItem, identity:NormalizationIdentity={normalization_id:`legacy:${item.id}`,normalization_version:1}):NormalizedMessage[] {
  const metadata=metadataObject(item.metadata), attachments=Array.isArray(metadata.attachments)?metadata.attachments:[];
  const sender=typeof metadata.sender==='string'?metadata.sender:"";
  const timestamp=typeof metadata.timestamp==='string'?metadata.timestamp:item.created_at;
  const chunks=item.original_text.trim().split(/\n\s*\n+/).map(s=>s.trim()).filter(Boolean);
  return (chunks.length?chunks:[item.original_text]).filter(Boolean).map((text,index)=>({
    id:`evidence:${identity.normalization_id}:${index+1}`,user_id:item.user_id,source_type:item.source_type,source_id:item.id,text,
    language:detectLanguage(text),timestamp,sender,attachments,metadata,confidence:detectLanguage(text)==="unknown"?"low":"medium",
    inbox_item_id:item.id,normalization_id:identity.normalization_id,normalization_version:identity.normalization_version,
  }));
}

export function eventEngineInput(messages:NormalizedMessage[]):NormalizedMessage[]{return messages}

function cleanEnglish(text:string){return text.replace(/\s+/g,' ').replace(boilerplate,'').replace(/^[@#\-\s]+/,'').trim()}
function englishDeadline(text:string){
  const before=text.match(/\b(?:before|by)\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i)?.[1];
  if(before)return `Due ${before[0].toUpperCase()+before.slice(1).toLowerCase()}`;
  const date=text.match(/\b(?:before|by)\s+([A-Z][a-z]+\s+\d{1,2})\b/)?.[1];
  return date?`Due ${date}`:"";
}
function chineseDeadline(text:string){
  const match=text.match(/(周[一二三四五六日天]|星期[一二三四五六日天]|\d{1,2}月\d{1,2}[日号]?)(?:前|前提交|截止)?/);
  return match?`${match[1]}前`:"";
}
function englishTitle(text:string){
  const clean=cleanEnglish(text), lower=clean.toLowerCase(), due=englishDeadline(clean);
  const hasMaterials=/\b(application|form|document|material|supporting)\b/.test(lower);
  if(/financial\s+aid/.test(lower))return ["Financial Aid",hasMaterials?"Materials":"Application",due].filter(Boolean).join(" ");
  if(/\bcet[-\s]?6\b/.test(lower))return ["CET-6 Registration",due].filter(Boolean).join(" ");
  const subject=clean.match(/(?:submit|send|apply for|register for|complete|confirm)\s+(?:the\s+)?(.{3,72}?)(?:\s+(?:before|by)\b|[.!?]|$)/i)?.[1]
    ||clean.match(/^(.{3,72}?)(?:\s+(?:before|by)\b|[.!?]|$)/)?.[1]||"Campus Notice";
  const action=/\bsubmit\b/i.test(clean)?"Submit":/\bsend\b/i.test(clean)?"Send":/\bapply\b/i.test(clean)?"Apply":/\bregister\b/i.test(clean)?"Register":/\bconfirm\b/i.test(clean)?"Confirm":"Review";
  return [subject.replace(/^(the|your)\s+/i,"").replace(/\s+/g," ").trim(),action,due].filter(Boolean).join(" ");
}
function chineseTitle(text:string){
  const subject=/助学金|困难认定/.test(text)?"助学金材料":/六级|CET[-\s]?6/i.test(text)?"六级报名":/课表/.test(text)?"课表安排":/选课/.test(text)?"选课安排":"校园消息";
  const action=/提交|发送|上交/.test(text)?"提交":/报名/.test(text)?"报名":/填写/.test(text)?"填写":/确认|核对/.test(text)?"确认":"待核对";
  return [subject,chineseDeadline(text),action].filter(Boolean).join("");
}

export function deriveDisplayContent(message:NormalizedMessage, preference:ContentLanguagePreference){
  const language=preference==='zh'?"zh-CN":preference==='en'?"en-US":message.language==='en-US'?"en-US":"zh-CN";
  const text=message.text;
  if(language==='en-US')return {title:englishTitle(text),summary:cleanEnglish(text),outputLanguage:language};
  return {title:chineseTitle(text),summary:text.replace(/\s+/g,' ').trim(),outputLanguage:language};
}
