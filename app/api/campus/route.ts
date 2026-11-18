import { z } from "zod";
import { getUser } from "@/lib/auth";
import { assertWrite, HttpError, throttle } from "@/lib/security";
import { importMessages } from "@/lib/importer";
import { database, initializeUser, insertEntry, readState } from "@/lib/storage";
import { addDays, chinaDate, decisionsLeft, makeEntry } from "@/lib/campus";
import { parseList, type ActionItem } from "@/lib/campus";

export const dynamic = "force-dynamic";
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
const validDate=(s:string)=>!s || (/^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(s+"T00:00:00Z").toISOString().slice(0,10)===s);
const day=z.string().refine(validDate,"请填写有效日期");
const deadline=z.string().refine(s=> !s || (validDate(s.slice(0,10)) && (s.length===10 || /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(s))),"请填写有效截止时间");
const fields=z.object({title:z.string().trim().min(1,"请填写任务名称").max(120),deadline,planDate:day,place:z.string().max(200),recipient:z.string().max(200),method:z.string().max(400),attachments:z.string().max(500),filename:z.string().max(200)});
const command=z.discriminatedUnion("action",[
  z.object({action:z.literal("import"),text:z.string().trim().min(2).max(200000),reference:day.optional(),mode:z.enum(["auto","rules"]).optional(),source:z.string().trim().max(80),sourceType:z.enum(["group","official"]),contentLanguage:z.enum(["original","zh","en"]).optional()}),
  z.object({action:z.literal("create"),fields}),
  z.object({action:z.literal("edit_subtask"),id:z.string().min(1).max(200),index:z.number().int().min(0).max(100),fields:z.object({label:z.string().trim().min(1).max(160),deadline,role:z.string().max(60)})}),
  z.object({action:z.literal("subtask"),id:z.string().min(1).max(200),index:z.number().int().min(0).max(100),done:z.boolean()}),
  z.object({action:z.literal("update"),id:z.string().min(1).max(200),fields}),
  z.object({action:z.enum(["confirm","complete","restore","ignore","review","tomorrow","plan_today","delete"]),id:z.string().min(1).max(200)}),
  z.object({action:z.enum(["visit_today","checkin","clear_samples"])}),
]);
export async function GET(request:Request) {
  let user;try{user=await getUser(request)}catch{return reply({error:"暂时无法读取登录状态，请稍后重试。"},503)}; if(!user)return reply({error:"请登录后查看你的校园行动台。"},401);
  try { await initializeUser(user.userId,user.fullName || "同学"); return reply(await readState(user.userId)); }
  catch(error) { console.error("Campus load failed",error); return reply({error:"暂时无法读取数据，请稍后重试。"},503); }
}
export async function POST(request:Request) {
  let user;try{user=await getUser(request)}catch{return reply({error:"暂时无法读取登录状态，请稍后重试。"},503)}; if(!user)return reply({error:"登录状态已失效，请重新登录。"},401);
  if(request.headers.get("x-campus-action")!=="1")return reply({error:"请求未通过校验，请刷新后重试。"},403);
  let data:z.infer<typeof command>;
  try {
    const raw=await request.text(); if(raw.length>1100000)return reply({error:"内容过长，请分批导入。"},400);
    data=command.parse(JSON.parse(raw));
  }catch(error){ return reply({error:error instanceof z.ZodError ? error.issues[0].message : "请检查输入内容。"},400); }
  try {
    assertWrite(request);
    const db=database(), userId=user.userId, today=chinaDate();
    if(data.action==="import") {
      assertWrite(request); await throttle('import:'+userId,20,3600);
      const report=await importMessages(userId,data.text,data.source,'text',{reference:data.reference||today,mode:data.mode,contentLanguage:data.contentLanguage,metadata:{channel:data.sourceType}});
      return reply({...await readState(userId),importReport:report});
    } else if(data.action==="create") {
      await insertEntry(makeEntry({...data.fields,id:crypto.randomUUID(),status:"active",reviewedDate:today,original:"手动创建的待办"}),userId).run();
    } else if(data.action==="visit_today") {
      await db.prepare("UPDATE profiles SET viewed_date = ? WHERE user_id = ?").bind(today,userId).run();
    } else if(data.action==="clear_samples") {
      await db.prepare("DELETE FROM entries WHERE user_id = ? AND sample = 1").bind(userId).run();
    } else if(data.action==="checkin") {
      const state=await readState(userId);
      if(state.profile.viewedDate!==today || decisionsLeft(state.entries,today)>0)return reply({error:"请先查看今日看板，并处理所有待确认与今日待决策事项。"},409);
      await db.prepare("INSERT OR IGNORE INTO checkins (id,user_id,date) VALUES (?,?,?)").bind(crypto.randomUUID(),userId,today).run();
    } else if("id" in data) {
      const current=await db.prepare("SELECT status,action_items AS actionItems,title,deadline,plan_date AS planDate,place,recipient,method,attachments,filename FROM entries WHERE id = ? AND user_id = ?").bind(data.id,userId).first<{status:string;actionItems:string}>();
      if(!current)return reply({error:"这条事项不存在或已被删除，请刷新列表。"},404);
      if(data.action==="update") {
        const f=data.fields;
        await db.batch([db.prepare("UPDATE entries SET title = ?, deadline = ?, plan_date = ?, place = ?, recipient = ?, method = ?, attachments = ?, filename = ? WHERE id = ? AND user_id = ?").bind(f.title,f.deadline,f.planDate,f.place,f.recipient,f.method,f.attachments,f.filename,data.id,userId),db.prepare("INSERT INTO entry_versions (id,user_id,entry_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(),userId,data.id,JSON.stringify(current),JSON.stringify(f),new Date().toISOString())]);
      } else if(data.action==="edit_subtask") {
        const items=parseList<ActionItem>(current.actionItems);if(!items[data.index])return reply({error:"子任务不存在。"},404);items[data.index]={...items[data.index],...data.fields};
        const serialized=JSON.stringify(items),nextDeadline=items.filter(a=>!a.done).map(a=>a.deadline).filter(Boolean).sort()[0]||"";
        await db.batch([db.prepare("UPDATE entries SET action_items = ?,deadline = ? WHERE id = ? AND user_id = ?").bind(serialized,nextDeadline,data.id,userId),db.prepare("INSERT INTO entry_versions (id,user_id,entry_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(),userId,data.id,JSON.stringify({actionItems:current.actionItems}),JSON.stringify({actionItems:serialized}),new Date().toISOString())]);
      } else if(data.action==="subtask") {
        const items=parseList<ActionItem>(current.actionItems);if(!items[data.index])return reply({error:"子任务不存在。"},404);items[data.index].done=data.done;
        const nextDeadline=items.filter(a=>!a.done).map(a=>a.deadline).filter(Boolean).sort()[0]||"";
        await db.prepare("UPDATE entries SET action_items = ?,deadline = ? WHERE id = ? AND user_id = ?").bind(JSON.stringify(items),nextDeadline,data.id,userId).run();
      } else if(data.action==="delete") {
        await db.batch([db.prepare("DELETE FROM entry_versions WHERE entry_id = ? AND user_id = ?").bind(data.id,userId),db.prepare("DELETE FROM entries WHERE id = ? AND user_id = ?").bind(data.id,userId)]);
      } else {
        const allowed:Record<string,string[]>={confirm:["candidate","info"],complete:["active"],restore:["done","ignored"],ignore:["candidate","info","active"],review:["active"],tomorrow:["active"],plan_today:["active"]};
        if(!allowed[data.action]?.includes(current.status))return reply({error:"事项状态已变化，请刷新后重试。"},409);
        if(data.action==="confirm" || data.action==="restore")
          await db.prepare("UPDATE entries SET status = 'active', plan_date = ?, reviewed_date = ?, completed_at = '' WHERE id = ? AND user_id = ?").bind(today,today,data.id,userId).run();
        if(data.action==="complete" || data.action==="ignore")
          await db.prepare("UPDATE entries SET status = ?, reviewed_date = ?, completed_at = ? WHERE id = ? AND user_id = ?").bind(data.action==="complete"?"done":"ignored",today,new Date().toISOString(),data.id,userId).run();
        if(data.action==="review")
          await db.prepare("UPDATE entries SET reviewed_date = ? WHERE id = ? AND user_id = ?").bind(today,data.id,userId).run();
        if(data.action==="tomorrow" || data.action==="plan_today")
          await db.prepare("UPDATE entries SET plan_date = ?, reviewed_date = ? WHERE id = ? AND user_id = ?").bind(data.action==="tomorrow"?addDays(today,1):today,today,data.id,userId).run();
      }
    }
    return reply(await readState(user.userId));
  }catch(error){ if(error instanceof HttpError)return reply({error:error.message},error.status); console.error("Campus save failed",error); return reply({error:"保存失败，当前输入已保留，请稍后重试。"},503); }
}
