export function allowedRedirect(value:string){
 try{
  const uri=new URL(value);
  return uri.origin==="https://chatgpt.com"&&!uri.username&&!uri.password&&!uri.search&&!uri.hash&&
   (/^\/connector\/oauth\/[A-Za-z0-9_-]{4,160}$/.test(uri.pathname)||uri.pathname==="/connector_platform_oauth_redirect");
 }catch{return false;}
}
export function tokenIsUsable(row:{
 kind:string;revokedAt:string|null;expiresAt:number;resource:string;
},expectedResource:string,at:number){
 return row.kind==="access"&&!row.revokedAt&&row.expiresAt>at&&row.resource===expectedResource;
}
export function hasRequiredScope(actual:string,required:string){
 return actual.split(/\s+/).includes(required);
}
export async function pkceS256(verifier:string){
 const hash=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier)));
 return btoa(String.fromCharCode(...hash)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
