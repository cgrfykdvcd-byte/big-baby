import { addDays, chinaDate, makeEntry, type ActionItem, type Entry } from "./campus";
function safeDate(year: number, month: number, day: number) {
  const d = new Date(Date.UTC(year,month-1,day));
  return d.getUTCFullYear()===year && d.getUTCMonth()===month-1 && d.getUTCDate()===day ? `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}` : "";
}
export function extractDeadline(text: string, today: string) {
  const explicit = text.match(/(?:(20\d{2})[年\-/])?(\d{1,2})[月\-/](\d{1,2})(?:日|号)?/);
  let day = "", note = "";
  if (explicit) {
    day = safeDate(Number(explicit[1] || today.slice(0,4)),Number(explicit[2]),Number(explicit[3]));
    if(!day) return {deadline:"",deadlineNote:"原文日期可能无效，请核对。"};
    if(!explicit[1]) note = "年份按当前年份提取，请核对。";
  } else if(/后天/.test(text)) day=addDays(today,2);
  else if(/明天|明晚|明早/.test(text)) day=addDays(today,1);
  else if(/今天|今日|今晚/.test(text)) day=today;
  else {
    const w = text.match(/(下周|本周|这周|周|星期)([一二三四五六日天])/);
    if(w) {
      const current = new Date(today+"T12:00:00+08:00").getUTCDay() || 7;
      const target = "一二三四五六日".indexOf(w[2]==="天"?"日":w[2])+1;
      let delta=target-current;
      if(w[1]==="下周") delta+=7;
      else if(w[1]==="周" || w[1]==="星期") { if(delta<0)delta+=7; }
      day=addDays(today,delta); note="星期按北京时间推算，请核对具体日期。";
    }
  }
  if(!day) return {deadline:"",deadlineNote:"原文没有明确日期，请补充；不会自动猜测截止时间。"};
  const clock=text.match(/(?:(上午|下午|晚上|中午|今晚|明晚)\s*)?(\d{1,2})[:：](\d{2})/) || text.match(/(上午|下午|晚上|中午|今晚|明晚)?\s*(\d{1,2})[点时](半|\d{1,2}分)?/);
  if(!clock) return {deadline:day,deadlineNote:note+"原文未提供准确时间；仅保留日期。"};
  let hour=Number(clock[2]); const minute=clock[3]==="半" ? 30 : Number((clock[3]||"0").replace("分",""));
  if(clock[1] && /下午|晚上|中午|今晚|明晚/.test(clock[1]) && hour<12) hour+=12;
  if(hour>23||minute>59) return {deadline:day,deadlineNote:"时间格式无效，请手动核对。"};
  return {deadline:day+`T${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`,deadlineNote:note+"规则提取可能混淆活动时间与截止时间，请对照原文。"};
}
export type RawMessage={content:string;original:string;sender:string;sentAt:string};
export function splitMessages(text:string):RawMessage[]{
 const normalized=text.replace(/\r\n?/g,'\n').trim();
 const lines=normalized.split('\n'),starts:number[]=[];
 for(let i=0;i<lines.length-1;i++)if(lines[i].trim() && lines[i].trim().length<=80 && /^\s*20\d{2}[年\/-]\d{1,2}[月\/-]\d{1,2}(?:日)?\s+\d{1,2}[:：]\d{2}\s*$/.test(lines[i+1]))starts.push(i);
 if(starts.length){
  const result:RawMessage[]=[];if(starts[0]>0&&lines.slice(0,starts[0]).join('\n').trim())result.push({content:lines.slice(0,starts[0]).join('\n').trim(),original:lines.slice(0,starts[0]).join('\n').trim(),sender:'',sentAt:''});
  starts.forEach((start,i)=>{const end=starts[i+1]??lines.length;const stamp=lines[start+1].trim().match(/(20\d{2})[年\/-](\d{1,2})[月\/-](\d{1,2})(?:日)?\s+(\d{1,2})[:：](\d{2})/)!;result.push({sender:lines[start].trim(),sentAt:`${stamp[1]}-${stamp[2].padStart(2,'0')}-${stamp[3].padStart(2,'0')}T${stamp[4].padStart(2,'0')}:${stamp[5]}`,content:lines.slice(start+2,end).join('\n').trim(),original:lines.slice(start,end).join('\n').trim()})});
  return result.filter(x=>x.content);
 }
 return normalized.split(/\n\s*\n+/).filter(Boolean).map(content=>({content,original:content,sender:'',sentAt:''}));
}
function topic(text:string){
 const topics:[RegExp,string][]=[[/困难.{0,8}(认定|评定)|困难评定|困难认定|评审小组.{0,60}认定|认定.{0,60}公示/,'困难认定'],[/综合测评|综测/,'综合测评'],[/助学金/,'助学金申请'],[/奖学金/,'奖学金申请'],[/选课|退课/,'选课安排'],[/学生信息.{0,6}(核对|表)/,'学生信息核对'],[/图书馆/,'图书馆安排']];
 const t=topics.find(([re])=>re.test(text.replace(/\n/g,'')))?.[1];if(t)return t;
 const course=text.match(/(概率论|数理统计|经济法|财务管理|商务英语|微观经济学|宏观经济学|国际贸易|英语|数学)/)?.[1];
 if(course&&/作业|习题|论文|考试|案例/.test(text)){
  const detail=text.match(/第[一二三四五六七八九十百0-9]+[章节单元]|习题\s*[0-9]+(?:[-—][0-9]+)?|作业\s*[0-9一二三四五六七八九十]+/)?.[0];
  return detail?course+detail+(/考试/.test(text)?'考试':'作业'):'';
 }
 const named=text.match(/【([^】]{2,30})】|《([^》]{2,30})》/);return named?.[1]||named?.[2]||'';
}
export function groupMessages(messages:RawMessage[]){
 const groups:RawMessage[][]=[];
 for(const message of messages){const key=topic(message.content);const prior=key?groups.findLast(g=>topic(g.map(m=>m.content).join('\n'))===key && g[0].sentAt.slice(0,10)===message.sentAt.slice(0,10) && (!g[0].sender || !message.sender || g[0].sender===message.sender)):undefined;
  if(prior && prior.map(m=>m.content.length).reduce((a,b)=>a+b,0)+message.content.length<24000)prior.push(message);else groups.push([message]);
 }
 return groups;
}
const actionRe=/提交|交到|交给|上交|填写|填报|报名|缴费|核对|确认|签到|选课|退课|完成|上传|发送|发到|把.{1,80}(发|交)|将.{1,80}(发|交)/;
export function parseGroup(group:RawMessage[],source:string,sourceType:string,today=chinaDate()):Entry{
 const text=group.map(m=>m.content).join('\n'),original=group.map(m=>m.original).join('\n\n');
 const subject=topic(text),action=actionRe.test(text),negated=/无需|不用|不必|取消|暂停|更正|改为/.test(text);
 const category=/报名|比赛|竞赛/.test(text)?'活动报名':/作业|习题|案例分析|论文/.test(text)?'课程作业':/填表|填写|填报/.test(text)?'填表提交':/选课|退课|教务|考试/.test(text)?'教务通知':'校园事务';
 const actions:ActionItem[]=[];
 for(const msg of group){
  const clauses=msg.content.split(/[。；\n]+/).map(s=>s.trim()).filter(Boolean);
  for(const clause of clauses){if(!actionRe.test(clause))continue;
   const reference=msg.sentAt.slice(0,10)||today, time=extractDeadline(clause,reference);
   const recipient=clause.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]||clause.match(/(?:交给|发给|发送给)\s*([^，。；\n]{1,24})/)?.[1]||'';
   let label=clause.match(/(?:提交|填写|报名|缴费|核对|确认|上交|上传|完成)[^，。；！？\n]{1,38}/)?.[0]||clause.replace(/^请|^需要/g,'').slice(0,48);
   if(/纸质/.test(clause))label='提交纸质申请表与佐证材料';else if(/照片|拍成|电子|打包/.test(clause)&&/申请|认定|困难/.test(text))label='打包发送申请表照片与相关材料';
   actions.push({label,deadline:time.deadline,note:time.deadlineNote+(/之前|前/.test(clause)&&time.deadline.length===10?' “之前”的具体时点需核对。':''),recipient:recipient==='我'?msg.sender||'通知发布者':recipient,method:/邮箱|@/.test(clause)?'邮箱提交':/纸质/.test(clause)?'纸质提交':'',evidence:clause,role:/评审小组|成员|履职/.test(clause)?"评审成员":/申请|认定|困难/.test(text)?"申请学生":"相关同学",kind:"task"});
  }
 }
 if(/评审|履职/.test(text)){
  for(const m of group){const rule=m.content.split(/[。\n]+/).find(c=>/公示|履职|退出/.test(c));if(rule&&!actions.some(a=>a.evidence===rule))actions.push({label:'按公示与认定要求履行评审职责',deadline:'',note:'属于评审成员要求，申请学生请按自身角色选择。',recipient:'',method:'',evidence:rule,role:'评审成员',kind:'info'})}
 }
 const deadlines=actions.map(a=>a.deadline).filter(Boolean).sort();
 const simple=text.split(/[。\n]/).find(s=>actionRe.test(s))||text.split(/[。\n]/)[0];
 let title=subject?subject+(subject==='困难认定'?'：材料提交与评审要求':action?'：'+(actions[0]?.label.slice(0,24)||'事项安排'):'通知'):simple.replace(/@所有人|【.*?】|请大家|各位同学|同学们/g,'').trim().slice(0,48);
 if(!title)title='校园消息待核对';
 const notes=[negated?'含否定、变更或取消表述，请先确认当前要求。':'',actions.length>1?'包含多个行动或截止时间，请逐项核对。':'',!deadlines.length?'没有明确截止时间，请补充。':'',group.some(m=>m.sentAt)?'相对日期按消息发送日推算。':'相对日期按本次选择的参考日期推算。'].filter(Boolean);
 const policy=group.map(m=>m.content.split(/[。\n]/).filter(s=>/评审|履职|退出|公示/.test(s)).join('；')).filter(Boolean);
 const summary=subject==='困难认定'?(actions.filter(a=>a.kind!=='info').map(a=>a.label).join('；')+(policy.length?'；评审成员需按认定与公示要求履职。':'')):(actions.map(a=>a.label).join('；')||text.replace(/\n/g,' ').slice(0,160));
 return makeEntry({title,original,summary:summary.slice(0,500),actionItems:JSON.stringify(actions),keywords:JSON.stringify([subject,...(policy.length?['评审要求']:[])].filter(Boolean)),messageCount:group.length,source:source.trim()||'导入的班群消息',sourceType,category:action?category:'仅供知晓',status:action?'candidate':'info',deadline:deadlines[0]||'',deadlineNote:notes.join(' '),recipient:[...new Set(actions.map(a=>a.recipient).filter(Boolean))].join('；').slice(0,200),method:[...new Set(actions.map(a=>a.method).filter(Boolean))].join('；'),place:text.match(/(?:地点|纸质版交到)[：:]?\s*([^，。；\n]{1,30})/)?.[1]||'',filename:text.match(/(?:文件命名|命名要求|命名)[为：:\s]*([^，。；\n]{1,50})/)?.[1]||'',attachments:text.match(/(?:附件要求|需附|附上|附件)[为：:\s]*([^，。；\n]{1,80})/)?.[1]||'',confidence:negated||!deadlines.length?'重点核对':'待核对',extraction:'rules'});
}
export function parseMessages(text:string,source:string,sourceType:string,today=chinaDate()){return groupMessages(splitMessages(text)).map(group=>parseGroup(group,source,sourceType,today))}
