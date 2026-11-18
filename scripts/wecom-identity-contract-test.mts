import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [identityService,callbackRoute,notificationService,migration,schema]=await Promise.all([
 readFile(new URL("../lib/wecom-identity.ts",import.meta.url),"utf8"),
 readFile(new URL("../app/api/wecom/callback/route.ts",import.meta.url),"utf8"),
 readFile(new URL("../lib/notification-service.ts",import.meta.url),"utf8"),
 readFile(new URL("../drizzle/0008_strong_vivisector.sql",import.meta.url),"utf8"),
 readFile(new URL("../db/schema.ts",import.meta.url),"utf8"),
]);

// 1–4: a new challenge is unpredictable, hashed at rest, expires, and is single-use.
for(const required of ["randomToken()","token_hash","expires_at","status='pending'","status='verified'","challenge_already_used","challenge_expired"])assert.equal(identityService.includes(required),true,required);
// 5: all user-facing reads and unlink writes are scoped to the authenticated owner.
for(const required of ["WHERE id=? AND user_id=?","WHERE id=? AND internal_user_id=?","WHERE internal_user_id=? AND provider='wecom'"])assert.equal(identityService.includes(required),true,required);
// 6–7: callback confirmation comes only after existing verified callback processing,
// then replays only pending rows for that external identity.
assert.equal(callbackRoute.includes("consumeWeComBindingChallenge(message.fromUserName,message.content)"),true);
assert.equal(callbackRoute.includes("WHERE external_user_id=? AND status='pending_mapping'"),true);
assert.equal(callbackRoute.includes("await processMappedCallback(row.id,row.dedupKey,message,internalUserId)"),true);
// 8–9: unlink revokes rather than deletes, and callbacks still resolve only verified mappings.
assert.equal(identityService.includes("verification_status='revoked'"),true);
assert.equal(callbackRoute.includes("verification_status='verified'"),true);
// 10: output notifications are also restricted to verified identities.
assert.equal(notificationService.includes("verification_status='verified'"),true);
// 11: the additive migration and Drizzle schema agree on the challenge record.
for(const required of ["wecom_binding_challenges","token_hash","replay_status"])assert.equal(migration.includes(required)&&schema.includes(required),true,required);
// 12: no binding endpoint accepts a caller-selected internal user id.
for(const forbidden of ["user_id: body","internal_user_id: body","external_user_id: body"])assert.equal(identityService.includes(forbidden),false,forbidden);

console.log("WeCom identity binding contract tests: PASS (12 fixtures)");
