'use client';
import { unzipSync, strFromU8 } from 'fflate';
export async function readFileText(file:File):Promise<{text:string;notice:string}>{
 const ext=file.name.split('.').pop()?.toLowerCase();
 if(file.size>15*1024*1024)throw Error('单个文件最多 15 MB。');
 if(['png','jpg','jpeg','webp'].includes(ext||''))return {text:'',notice:'图片已选中，上传后使用你配置的视觉模型识别。'};
 if(['txt','md','csv','tsv','json','ics'].includes(ext||'')){const bytes=await file.arrayBuffer();let text=new TextDecoder().decode(bytes);if(text.includes('\uFFFD'))text=new TextDecoder('gb18030').decode(bytes);return check(text)}
 if(ext==='docx'||ext==='xlsx'){
  let total=0;const zip=unzipSync(new Uint8Array(await file.arrayBuffer()),{filter:f=>{if(!/^(word\/document|xl\/sharedStrings|xl\/worksheets\/sheet\d+)\.xml$/.test(f.name))return false;total+=f.originalSize;if(total>30*1024*1024)throw Error('解压后的内容过大，请拆分文件。');return true}});
  const xml=(value:Uint8Array)=>new DOMParser().parseFromString(strFromU8(value),'application/xml');
  if(ext==='docx'){
   if(!zip['word/document.xml'])throw Error('未找到 Word 正文，请上传有效的 DOCX 文件。');
   const doc=xml(zip['word/document.xml']),body=doc.getElementsByTagName('w:body')[0];
   const paragraph=(p:Element)=>Array.from(p.getElementsByTagName('w:t')).map(t=>t.textContent).join('');
   return check(Array.from(body.children).map(e=>e.tagName==='w:tbl'?Array.from(e.getElementsByTagName('w:tr')).map(row=>Array.from(row.getElementsByTagName('w:tc')).map(paragraph).join('\t')).join('\n'):paragraph(e)).join('\n'));
  }
  const strings=zip['xl/sharedStrings.xml']?Array.from(xml(zip['xl/sharedStrings.xml']).getElementsByTagName('si')).map(s=>s.textContent||''):[];
  const sheets=Object.entries(zip).filter(([key])=>/worksheets\/sheet\d+/.test(key)).sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true}));
  const result=sheets.map(([name,data])=>{const rows=Array.from(xml(data).getElementsByTagName('row')).map(row=>{const cells:string[]=[];for(const c of Array.from(row.getElementsByTagName('c'))){const ref=c.getAttribute('r')||'A1';let n=0;for(const ch of ref.replace(/\d/g,''))n=n*26+ch.charCodeAt(0)-64;const value=c.getElementsByTagName('v')[0]?.textContent||'';cells[n-1]=c.getAttribute('t')==='s'?(strings[Number(value)]||''):c.getAttribute('t')==='inlineStr'?(c.getElementsByTagName('is')[0]?.textContent||''):value}return Array.from({length:cells.length},(_,i)=>cells[i]||'').join('\t')});return (sheets.length>1?'工作表 '+name.split('/').pop()+'\n':'')+rows.join('\n')}).join('\n\n');
  return {...check(result),notice:'已读取单元格文字；若日期显示为数字、或仅标课节，请在预览中核对。'};
 }
 if(ext==='pdf'){
  const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc='/pdfjs/pdf.worker.min.mjs';
  const loading=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),cMapUrl:'/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/pdfjs/standard_fonts/',wasmUrl:'/pdfjs/wasm/'});const doc=await loading.promise;
  try{if(doc.numPages>150)throw Error('PDF 最多 150 页，请拆分后上传。');const pages:string[]=[];
   for(let i=1;i<=doc.numPages;i++){const page=await doc.getPage(i),content=await page.getTextContent();pages.push(content.items.map(item=>'str' in item?item.str+('hasEOL' in item&&item.hasEOL?'\n':' '):'').join(''));page.cleanup();if(pages.join('').length>200000)throw Error('正文超过 20 万字，请拆分文件。')}
   const text=pages.join('\n\n');if(text.trim().length<20)return {text:'',notice:'该 PDF 未读到可用文字。请上传页面截图使用视觉模型识别，或粘贴 OCR 文本。'};return check(text);
  }finally{await loading.destroy()}
 }
 throw Error('支持 TXT、MD、CSV、TSV、JSON、ICS、DOCX、XLSX、PDF 和 PNG/JPG/WebP 图片。');
}
function check(text:string){if(text.length>200000)throw Error('正文超过 20 万字，请拆分文件。');return {text,notice:''}}
