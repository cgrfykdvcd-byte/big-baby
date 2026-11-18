import { env } from "cloudflare:workers";
import { chinaDate, sampleEntries, type CampusState, type Entry } from "./campus";
import { detectLanguage, normalizeInboxItem, type InboxItem, type InboxProcessingStatus, type NormalizedMessage } from "./inbox";
export function database() {
  if(!env.DB) throw new Error("Campus storage binding is unavailable"); return env.DB;
}
const fields: (keyof Entry)[] = ["id","title","original","source","sourceType","category","status","deadline","deadlineNote","planDate","place","recipient","method","attachments","filename","reviewedDate","createdAt","completedAt","sample","summary","actionItems","keywords","messageCount","extraction","confidence","fileId","inboxItemId"];
const column=(s:string)=>s.replace(/[A-Z]/g,c=>"_"+c.toLowerCase());
export function insertEntry(entry: Entry, userId: string, ignore=false) {
  return database().prepare(`INSERT ${ignore?"OR IGNORE ":""}INTO entries (user_id,${fields.map(column).join(",")}) VALUES (${new Array(fields.length+1).fill("?").join(",")})`).bind(userId,...fields.map(f=>entry[f]));
}
export async function createInboxItem(input:Omit<InboxItem,"id"|"original_language"|"created_at"> & {id?:string;created_at?:string;original_language?:InboxItem["original_language"]}){
 const item:InboxItem={...input,id:input.id||crypto.randomUUID(),created_at:input.created_at||new Date().toISOString(),original_language:input.original_language||detectLanguage(input.original_text)};
 await database().prepare("INSERT INTO inbox_items (id,user_id,source_type,source_reference,original_text,original_language,processing_status,metadata,created_at,updated_at,failure_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(item.id,item.user_id,item.source_type,item.source_reference,item.original_text,item.original_language,item.processing_status,JSON.stringify(item.metadata),item.created_at,item.created_at,"").run();
 return item;
}
export async function updateInboxItem(id:string,userId:string,status:InboxProcessingStatus,patch:{originalText?:string;metadata?:Record<string,unknown>;failureReason?:string}={}){
 const current=await database().prepare("SELECT original_text AS originalText,metadata FROM inbox_items WHERE id=? AND user_id=?").bind(id,userId).first<{originalText:string;metadata:string}>();
 if(!current)throw new Error("Inbox item not found");
 const originalText=patch.originalText??current.originalText,metadata=patch.metadata??JSON.parse(current.metadata||"{}");
 await database().prepare("UPDATE inbox_items SET original_text=?,original_language=?,processing_status=?,metadata=?,updated_at=?,failure_reason=? WHERE id=? AND user_id=?").bind(originalText,detectLanguage(originalText),status,JSON.stringify(metadata),new Date().toISOString(),patch.failureReason||"",id,userId).run();
}
export async function normalizeAndStore(item:InboxItem):Promise<NormalizedMessage[]>{
 const db=database(),now=new Date().toISOString(),normalizationId=crypto.randomUUID();
 const latest=await db.prepare("SELECT COALESCE(MAX(version),0) AS version FROM inbox_normalizations WHERE user_id=? AND inbox_item_id=?").bind(item.user_id,item.id).first<{version:number}>();
 const normalizationVersion=(latest?.version||0)+1;
 const messages=normalizeInboxItem(item,{normalization_id:normalizationId,normalization_version:normalizationVersion});
 const statements=[db.prepare("INSERT INTO inbox_normalizations (id,user_id,inbox_item_id,version,status,failure_reason,created_at) VALUES (?,?,?,?,?,?,?)").bind(normalizationId,item.user_id,item.id,normalizationVersion,"processing","",now)];
 for(const message of messages) statements.push(db.prepare("INSERT INTO normalized_messages (id,user_id,inbox_item_id,normalization_id,normalization_version,source_type,source_id,text,language,timestamp,sender,attachments,metadata,confidence,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(message.id,message.user_id,item.id,message.normalization_id,message.normalization_version,message.source_type,message.source_id,message.text,message.language,message.timestamp,message.sender,JSON.stringify(message.attachments),JSON.stringify(message.metadata),message.confidence,now));
 statements.push(db.prepare("UPDATE inbox_normalizations SET status='ready' WHERE id=? AND user_id=?").bind(normalizationId,item.user_id));
 try{await db.batch(statements);return messages}catch(error){await db.prepare("UPDATE inbox_normalizations SET status='failed',failure_reason=? WHERE id=? AND user_id=?").bind(error instanceof Error?error.message:"Normalization failed",normalizationId,item.user_id).run();throw error;}
}
export async function readNormalizedMessages(userId:string,inboxItemId:string){return database().prepare("SELECT id,user_id AS user_id,inbox_item_id AS inbox_item_id,normalization_id AS normalization_id,normalization_version AS normalization_version,source_type AS source_type,source_id AS source_id,text,language,timestamp,sender,attachments,metadata,confidence FROM normalized_messages WHERE user_id=? AND inbox_item_id=? ORDER BY normalization_version,created_at,id").bind(userId,inboxItemId).all<NormalizedMessage>();}
export async function readState(userId: string): Promise<CampusState> {
  const db=database();
  const [rows,checks,profile] = await Promise.all([
    db.prepare(`SELECT ${fields.map(f=>`${column(f)} AS ${f}`).join(",")} FROM entries WHERE user_id = ? ORDER BY created_at DESC, id`).bind(userId).all<Entry>(),
    db.prepare("SELECT date FROM checkins WHERE user_id = ? ORDER BY date DESC").bind(userId).all<{date:string}>(),
    db.prepare("SELECT name, viewed_date AS viewedDate FROM profiles WHERE user_id = ?").bind(userId).first<{name:string;viewedDate:string}>(),
  ]);
  return {entries:rows.results,checkins:checks.results.map(x=>x.date),profile:profile || {name:"同学",viewedDate:""},today:chinaDate()};
}
export async function initializeUser(userId: string, name: string) {
  const db=database();
  const existing=await db.prepare("SELECT user_id FROM profiles WHERE user_id = ?").bind(userId).first(); if(existing) return;
  const samples=sampleEntries(chinaDate());
  const safeName=name && !name.includes("@") ? name.slice(0,36) : "同学";
  const statements=[db.prepare("INSERT OR IGNORE INTO profiles (user_id,name,viewed_date) VALUES (?,?,?)").bind(userId,safeName,"")];
  for(const sample of samples) { sample.id=userId+":"+sample.id; statements.push(insertEntry(sample,userId,true)); }
  await db.batch(statements);
}
