import { z } from 'zod';
import { addDays, type ScheduleEvent } from './campus';
export const validDay=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const time=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/,'请填写有效时间');
export const eventSchema=z.object({id:z.string().max(100).optional(),title:z.string().trim().min(1,'请填写日程名称').max(120),date:z.string().refine(validDay,'请填写有效日期'),start:time,end:time,repeatUntil:z.string().refine(s=>!s||validDay(s),'请填写有效结束日期'),weekdays:z.array(z.number().int().min(1).max(7)).max(7),location:z.string().max(200),kind:z.enum(['course','event']),notes:z.string().max(2000),fileId:z.string().max(100)}).refine(e=>e.end>e.start,'结束时间须晚于开始时间').refine(e=>!e.weekdays.length||(e.repeatUntil>=e.date&&e.repeatUntil<=addDays(e.date,370)),'每周重复日程需要填写一年内的结束日期');
export function emptyEvent(date:string):ScheduleEvent{return {id:'',title:'',date,start:'09:00',end:'10:00',repeatUntil:'',weekdays:[],location:'',kind:'event',notes:'',fileId:''}}
export function onDay(e:ScheduleEvent,day:string){if(!e.weekdays.length)return e.date===day;const weekday=new Date(day+'T12:00:00+08:00').getUTCDay()||7;return day>=e.date&&day<=e.repeatUntil&&e.weekdays.includes(weekday)}
export function parseCSV(text:string){
 const rows:string[][]=[];let row:string[]=[],value='',quote=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quote&&text[i+1]==='"'){value+='"';i++}else quote=!quote}else if((c===','||c==='\t')&&!quote){row.push(value);value=''}else if(c==='\n'&&!quote){row.push(value);rows.push(row);row=[];value=''}else if(c!=='\r')value+=c}row.push(value);if(row.some(Boolean))rows.push(row);return rows;
}
export function parseScheduleRows(text:string,termStart:string,termEnd:string):ScheduleEvent[]{
 const rows=parseCSV(text);if(rows.length<2)return [];const h=rows[0].map(c=>c.trim().toLowerCase());const find=(names:string[])=>h.findIndex(c=>names.includes(c));
 const title=find(['名称','课程','课程名称','title','日程']),date=find(['日期','date']),start=find(['开始','开始时间','start']),end=find(['结束','结束时间','end']),weekday=find(['星期','weekday','周几']),place=find(['地点','教室','location']),until=find(['重复结束','结束日期','repeatuntil']);if(title<0||start<0||end<0)return [];
 return rows.slice(1).filter(r=>r[title]?.trim()).map(row=>{const e=emptyEvent(row[date]?.trim()||termStart);const w=row[weekday]?.trim().replace(/星期|周/,'');const day=w?Number(w)||('一二三四五六日'.indexOf(w)+1):0;return {...e,title:row[title].trim(),start:row[start]?.trim()||'',end:row[end]?.trim()||'',weekdays:day>=1&&day<=7?[day]:[],repeatUntil:day?(row[until]?.trim()||termEnd):'',location:row[place]?.trim()||'',kind:'course'}});
}
