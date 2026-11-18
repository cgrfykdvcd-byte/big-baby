import assert from "node:assert/strict";
import { trustedConsentOrigin } from "../lib/mcp-consent-origin.ts";

const origin="https://big-baby.example";
function posted(headers:Record<string,string>){
 return new Request(`${origin}/oauth/authorize`,{method:"POST",headers,body:"consent=yes"});
}
assert.equal(trustedConsentOrigin(posted({origin}),origin),true,"ordinary same-origin consent");
assert.equal(trustedConsentOrigin(posted({origin:"null","sec-fetch-site":"same-origin","sec-fetch-mode":"navigate","sec-fetch-dest":"document"}),origin),true,"opaque-origin browser consent");
const badHeaders:Array<Record<string,string>>=[
 {origin:"null"},
 {origin:"null","sec-fetch-site":"cross-site","sec-fetch-mode":"navigate","sec-fetch-dest":"document"},
 {origin:"null","sec-fetch-site":"same-origin","sec-fetch-mode":"cors","sec-fetch-dest":"document"},
 {origin:"null","sec-fetch-site":"same-origin","sec-fetch-mode":"navigate","sec-fetch-dest":"empty"},
 {origin:"https://evil.example","sec-fetch-site":"same-origin","sec-fetch-mode":"navigate","sec-fetch-dest":"document"},
 {"sec-fetch-site":"same-origin","sec-fetch-mode":"navigate","sec-fetch-dest":"document"},
 ];
for(const headers of badHeaders)assert.equal(trustedConsentOrigin(posted(headers),origin),false,"untrusted consent request");
console.log("OAuth consent origin regression: PASS (8 cases)");
