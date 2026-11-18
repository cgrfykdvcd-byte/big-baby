const FIELDS=["client_id","redirect_uri","response_type","scope","state","code_challenge","code_challenge_method","resource"] as const;
const LIFETIME=15*60_000;

// The existing encrypted storage key authenticates the transaction. The form
// carries only this sealed value, so none of the OAuth parameters can be
// altered between rendering consent and approving it.
export async function createConsentTransaction(params:URLSearchParams,userId:string,seal:(value:string)=>Promise<string>,now=Date.now()){
 const fields=Object.fromEntries(FIELDS.map(name=>[name,params.get(name)||""]));
 return seal(JSON.stringify({fields,userId,expiresAt:now+LIFETIME}));
}

export async function recoverConsentTransaction(value:string,userId:string,unseal:(value:string)=>Promise<string>,now=Date.now()){
 if(!value||value.length>4096)throw new Error("invalid consent transaction");
 const payload=JSON.parse(await unseal(value)) as {fields?:Record<string,unknown>;userId?:unknown;expiresAt?:unknown};
 if(payload.userId!==userId||typeof payload.expiresAt!=="number"||payload.expiresAt<=now||payload.expiresAt>now+LIFETIME||
  !payload.fields||FIELDS.some(name=>typeof payload.fields?.[name]!=="string"))throw new Error("invalid consent transaction");
 return new URLSearchParams(FIELDS.map(name=>[name,payload.fields![name] as string]));
}
