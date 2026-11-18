export type EntryStatus = "candidate" | "info" | "active" | "done" | "ignored";
export type Entry = {
  summary:string; actionItems:string; keywords:string; messageCount:number; extraction:string; confidence:string; fileId:string; inboxItemId:string;
  id: string; title: string; original: string; source: string; sourceType: string;
  category: string; status: EntryStatus; deadline: string; deadlineNote: string;
  planDate: string; place: string; recipient: string; method: string;
  attachments: string; filename: string; reviewedDate: string;
  createdAt: string; completedAt: string; sample: number;
};
export type Profile = { name: string; viewedDate: string };
export type CampusState = { entries: Entry[]; checkins: string[]; profile: Profile; today: string; importReport?: {received:number;created:number;duplicates:number;engine:string;warnings:string[]} };
export type ActionItem={label:string;deadline:string;note:string;recipient:string;method:string;evidence:string;role?:string;kind?:string;done?:boolean};
export type ScheduleEvent={id:string;title:string;date:string;start:string;end:string;repeatUntil:string;weekdays:number[];location:string;kind:string;notes:string;fileId:string};
export function parseList<T>(value:string):T[]{try{const v=JSON.parse(value);return Array.isArray(v)?v:[]}catch{return []}}
export function chinaDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function addDays(date: string, n: number) {
  const d = new Date(date + "T12:00:00+08:00"); d.setUTCDate(d.getUTCDate() + n); return chinaDate(d);
}
export function dueDate(entry: Entry) { return entry.deadline.slice(0, 10); }
export function needsToday(entry: Entry, today: string) {
  return entry.status === "active" && ((!!entry.planDate && entry.planDate <= today) || (!!entry.deadline && dueDate(entry) <= today));
}
export function decisionsLeft(entries: Entry[], today: string) {
  return entries.filter(e => e.status === "candidate" || e.status === "info" || (needsToday(e, today) && e.reviewedDate !== today)).length;
}
export function streakCount(checkins: string[], today: string) {
  let day = checkins.includes(today) ? today : addDays(today, -1), n = 0;
  while(checkins.includes(day)) { n++; day = addDays(day, -1); } return n;
}
export function dateLabel(value: string, today: string) {
  if(!value) return "截止时间待确认";
  const date = value.slice(0,10), time = value.slice(11,16);
  const label = date === today ? "今天" : date === addDays(today,1) ? "明天" : `${Number(date.slice(5,7))}月${Number(date.slice(8,10))}日`;
  return label + (time ? ` ${time}` : " · 时间待确认");
}
export function makeEntry(partial: Partial<Entry>): Entry {
  return { summary:"",actionItems:"[]",keywords:"[]",messageCount:1,extraction:"rules",confidence:"需核对",fileId:"",inboxItemId:"", id: "", title: "", original: "", source: "手动添加", sourceType: "manual", category: "校园事务", status: "candidate", deadline: "", deadlineNote: "", planDate: "", place: "", recipient: "", method: "", attachments: "", filename: "", reviewedDate: "", createdAt: new Date().toISOString(), completedAt: "", sample: 0, ...partial };
}
export function sampleEntries(today: string): Entry[] {
  const tomorrow = addDays(today,1), after = addDays(today,2);
  return [
    makeEntry({id:"sample-1", title:"提交经济法案例分析", status:"active", category:"课程作业", source:"经济法课程群", sourceType:"group", deadline:today+"T17:00", planDate:today, method:"课程平台提交 PDF", recipient:"任课老师", filename:"学号+姓名+案例分析", original:"【示例通知】请同学们于今天17:00前提交经济法案例分析，上传到课程平台，文件命名：学号+姓名+案例分析。", sample:1}),
    makeEntry({id:"sample-2", title:"确认本学期选课结果", status:"active", category:"教务通知", source:"教务处 · 示例通知", sourceType:"official", deadline:today+"T23:59", planDate:today, method:"登录教务系统核对", original:"【示例通知】请于今天23:59前登录教务系统核对本学期选课结果，如有问题请联系教学秘书。", sample:1}),
    makeEntry({id:"sample-3", title:"整理综合测评申报材料", status:"active", category:"校园事务", source:"2025级国贸班群", sourceType:"group", deadline:after+"T17:00", planDate:today, place:"逸夫楼 A203", recipient:"班长", filename:"学号+姓名", attachments:"综测申请表、证明材料", method:"电子版发班长，纸质版交 A203", original:"【示例通知】请于后天17:00前提交综测材料，电子版发给班长，文件命名：学号+姓名，纸质版交到逸夫楼A203。请附综测申请表和证明材料。", sample:1}),
    makeEntry({id:"sample-4", title:"提交概率论课后习题", status:"active", category:"课程作业", source:"概率论课程群", sourceType:"group", deadline:tomorrow+"T20:00", planDate:tomorrow, original:"【示例通知】请明天20:00前在课程平台提交概率论第一章课后习题。", method:"课程平台", sample:1}),
    makeEntry({id:"sample-5", title:"填写学生信息核对表", status:"candidate", category:"填表提交", source:"2025级国贸班群", sourceType:"group", deadline:tomorrow+"T18:00", method:"班群共享表格", recipient:"班长", original:"【示例通知】@所有人 请大家明天18:00前填写学生信息核对表，在班群共享表格中核对学号和姓名，完成后告知班长。", sample:1}),
    makeEntry({id:"sample-6", title:"确认是否报名商务英语演讲赛", status:"candidate", category:"活动报名", source:"学院通知 · 示例", sourceType:"official", deadline:after+"T17:00", original:"【示例通知】商务英语演讲赛开始报名，有意参加的同学请于后天17:00前填写报名表，发送给学习委员。", recipient:"学习委员", attachments:"报名表", method:"发送报名表给学习委员", sample:1}),
    makeEntry({id:"sample-7", title:"图书馆开放时间调整", status:"info", category:"仅供知晓", source:"校园通知 · 示例", sourceType:"official", original:"【示例通知】本周六图书馆开放时间调整为9:00—18:00，请合理安排到馆时间。", sample:1}),
  ];
}
