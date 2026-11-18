import assert from "node:assert/strict";
import { createConsentTransaction, recoverConsentTransaction } from "../lib/mcp-consent-transaction.ts";

const key=await crypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
async function seal(value:string){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode(value));
 return `${Buffer.from(iv).toString("hex")}:${Buffer.from(cipher).toString("hex")}`;
}
async function unseal(value:string){
 const [iv,cipher]=value.split(":").map(value=>Buffer.from(value,"hex"));
 return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv},key,cipher));
}
const params=new URLSearchParams({client_id:"registered-client",redirect_uri:"https://chatgpt.com/connector_platform_oauth_redirect",response_type:"code",scope:"handoff:create",state:"state-test",code_challenge:"A".repeat(43),code_challenge_method:"S256",resource:"https://big-baby.example/api/mcp"});
const signed=await createConsentTransaction(params,"user-A",seal,1000);
const recovered=await recoverConsentTransaction(signed,"user-A",unseal,1001);
for(const [name,value] of params)assert.equal(recovered.get(name),value,`preserved ${name}`);
assert.deepEqual([...recovered.keys()].sort(),[...params.keys()].sort());
await assert.rejects(recoverConsentTransaction(signed,"user-B",unseal,1001),/invalid consent transaction/);
await assert.rejects(recoverConsentTransaction(signed,"user-A",unseal,1000+15*60_000),/invalid consent transaction/);
await assert.rejects(recoverConsentTransaction(`${signed.slice(0,-2)}${signed.endsWith("00")?"01":"00"}`,"user-A",unseal,1001));
await assert.rejects(recoverConsentTransaction("", "user-A",unseal,1001),/invalid consent transaction/);
console.log("OAuth consent transaction regression: PASS (field binding, user, expiry, tamper)");
