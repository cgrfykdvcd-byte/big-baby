import { digest, HttpError, randomToken } from "./security";
import { database } from "./storage";

const now=()=>new Date().toISOString();
const challengeLifetimeMs=10*60*1000;
type ChallengeRow={id:string;userId:string;tokenHash:string;status:string;externalUserId:string;expiresAt:number;usedAt:string|null;replayStatus:string;createdAt:string;updatedAt:string};
type IdentityRow={id:string;provider:string;externalUserId:string;internalUserId:string;verificationStatus:"pending"|"verified"|"revoked";createdAt:string;updatedAt:string};

const challenge=(row:ChallengeRow)=>({id:row.id,status:row.status,external_user_id:row.externalUserId||null,expires_at:new Date(row.expiresAt).toISOString(),used_at:row.usedAt,replay_status:row.replayStatus,created_at:row.createdAt,updated_at:row.updatedAt});
const identity=(row:IdentityRow)=>({id:row.id,provider:row.provider,external_user_id:row.externalUserId,verification_status:row.verificationStatus,created_at:row.createdAt,updated_at:row.updatedAt});

export async function startWeComBinding(userId:string){
 const db=database(),time=now(),token=randomToken(),tokenHash=await digest(token),id=crypto.randomUUID(),expiresAt=Date.now()+challengeLifetimeMs;
 await db.batch([
  db.prepare("UPDATE wecom_binding_challenges SET status='superseded',updated_at=? WHERE user_id=? AND status='pending'").bind(time,userId),
  db.prepare("INSERT INTO wecom_binding_challenges (id,user_id,token_hash,status,external_user_id,expires_at,used_at,replay_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(id,userId,tokenHash,"pending","",expiresAt,null,"pending",time,time),
 ]);
 return {challenge_id:id,challenge:token,expires_at:new Date(expiresAt).toISOString(),instruction:`BIND ${token}`};
}

export async function bindingChallengeStatus(userId:string,challengeId:string){
 const row=await database().prepare("SELECT id,user_id AS userId,token_hash AS tokenHash,status,external_user_id AS externalUserId,expires_at AS expiresAt,used_at AS usedAt,replay_status AS replayStatus,created_at AS createdAt,updated_at AS updatedAt FROM wecom_binding_challenges WHERE id=? AND user_id=?").bind(challengeId,userId).first<ChallengeRow>();
 if(!row)throw new HttpError("绑定请求不存在。",404);
 if(row.status==="pending"&&row.expiresAt<=Date.now()){const time=now();await database().prepare("UPDATE wecom_binding_challenges SET status='expired',updated_at=? WHERE id=? AND user_id=? AND status='pending'").bind(time,row.id,userId).run();row.status="expired";row.updatedAt=time;}
 return challenge(row);
}

export async function listWeComIdentities(userId:string){
 const rows=await database().prepare("SELECT id,provider,external_user_id AS externalUserId,internal_user_id AS internalUserId,verification_status AS verificationStatus,created_at AS createdAt,updated_at AS updatedAt FROM external_identities WHERE internal_user_id=? AND provider='wecom' ORDER BY updated_at DESC").bind(userId).all<IdentityRow>();
 return rows.results.map(identity);
}

export async function listWeComPendingMappings(userId:string){
 const rows=await database().prepare("SELECT c.external_user_id AS externalUserId,COUNT(*) AS count,MAX(c.created_at) AS latestAt FROM wecom_callbacks c JOIN external_identities i ON i.provider='wecom' AND i.external_user_id=c.external_user_id WHERE i.internal_user_id=? AND c.status='pending_mapping' GROUP BY c.external_user_id ORDER BY latestAt DESC").bind(userId).all<{externalUserId:string;count:number;latestAt:string}>();
 return rows.results.map(row=>({external_user_id:row.externalUserId,count:row.count,latest_at:row.latestAt}));
}

export async function unlinkWeComIdentity(userId:string,identityId:string){
 const time=now(),result=await database().prepare("UPDATE external_identities SET verification_status='revoked',updated_at=? WHERE id=? AND internal_user_id=? AND provider='wecom' AND verification_status!='revoked'").bind(time,identityId,userId).run();
 if((result.meta.changes||0)!==1)throw new HttpError("企业微信绑定不存在或已解除。",404);
 return {id:identityId,verification_status:"revoked" as const,updated_at:time};
}

// Called only after the WeCom callback has been verified and decrypted. A user
// proves control by sending the challenge from their own WeCom account.
export async function consumeWeComBindingChallenge(externalUserId:string,content:string){
 const match=content.trim().match(/^BIND\s+([a-f0-9]{64})$/i);if(!match)return null;
 const db=database(),tokenHash=await digest(match[1]),row=await db.prepare("SELECT id,user_id AS userId,token_hash AS tokenHash,status,external_user_id AS externalUserId,expires_at AS expiresAt,used_at AS usedAt,replay_status AS replayStatus,created_at AS createdAt,updated_at AS updatedAt FROM wecom_binding_challenges WHERE token_hash=?").bind(tokenHash).first<ChallengeRow>();
 if(!row)return {accepted:false as const,reason:"challenge_not_found"};
 if(row.status!=="pending")return {accepted:false as const,reason:"challenge_already_used"};
 if(row.expiresAt<=Date.now()){await db.prepare("UPDATE wecom_binding_challenges SET status='expired',updated_at=? WHERE id=? AND status='pending'").bind(now(),row.id).run();return {accepted:false as const,reason:"challenge_expired"};}
 const existing=await db.prepare("SELECT id,internal_user_id AS internalUserId,verification_status AS verificationStatus FROM external_identities WHERE provider='wecom' AND external_user_id=?").bind(externalUserId).first<{id:string;internalUserId:string;verificationStatus:string}>();
 if(existing&&existing.internalUserId!==row.userId)return {accepted:false as const,reason:"identity_already_bound"};
 const time=now(),claimed=await db.prepare("UPDATE wecom_binding_challenges SET status='verified',external_user_id=?,used_at=?,updated_at=? WHERE id=? AND status='pending' AND expires_at>?").bind(externalUserId,time,time,row.id,Date.now()).run();
 if((claimed.meta.changes||0)!==1)return {accepted:false as const,reason:"challenge_already_used"};
 if(existing)await db.prepare("UPDATE external_identities SET verification_status='verified',updated_at=? WHERE id=? AND internal_user_id=?").bind(time,existing.id,row.userId).run();
 else await db.prepare("INSERT INTO external_identities (id,provider,external_user_id,internal_user_id,verification_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(),"wecom",externalUserId,row.userId,"verified",time,time).run();
 return {accepted:true as const,userId:row.userId,challengeId:row.id};
}

export async function setWeComBindingReplayStatus(challengeId:string,status:"completed"|"failed"){await database().prepare("UPDATE wecom_binding_challenges SET replay_status=?,updated_at=? WHERE id=?").bind(status,now(),challengeId).run();}
