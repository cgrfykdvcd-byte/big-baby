import assert from "node:assert/strict";
import { deriveDisplayContent, detectLanguage, normalizeInboxItem, type InboxItem } from "../lib/inbox.ts";

const base=(original_text:string,source_type:InboxItem["source_type"]="text"):InboxItem=>({id:"test",user_id:"u1",source_type,source_reference:"test",original_text,original_language:detectLanguage(original_text),processing_status:"received",metadata:{},created_at:"2026-09-13T00:00:00.000Z"});

assert.equal(detectLanguage("请于周五前提交助学金申请材料"),"zh-CN");
assert.equal(detectLanguage("Students must submit the form before Saturday."),"en-US");
assert.equal(detectLanguage("CET-6 报名 Financial Aid申请"),"mixed");
assert.equal(normalizeInboxItem(base("第一条通知\n\n第二条通知")).length,2);
assert.match(normalizeInboxItem(base("证据"))[0].id,/^evidence:legacy:test:1$/);

const english=normalizeInboxItem(base("Students applying for the financial aid assessment must send electronic copies of the application form and supporting documents before Saturday."))[0];
const englishDisplay=deriveDisplayContent(english,"en");
assert.equal(englishDisplay.title,"Financial Aid Materials Due Saturday");
assert.ok(!englishDisplay.title.includes("Students applying"));
assert.equal(deriveDisplayContent(english,"zh").outputLanguage,"zh-CN");
assert.equal(deriveDisplayContent(english,"original").outputLanguage,"en-US");

assert.equal(normalizeInboxItem(base("","image")).length,0);
assert.equal(normalizeInboxItem(base("","file")).length,0);
assert.equal(normalizeInboxItem(base("概率论 2026-09-16 19:00–21:35","schedule"))[0].source_type,"schedule");
assert.equal(base("","image").processing_status,"received");
assert.equal(({...base(""),processing_status:"failed" as const}).processing_status,"failed");
assert.equal(({...base(""),processing_status:"needs_review" as const}).processing_status,"needs_review");

console.log("Inbox contract tests: PASS (10 scenarios)");
