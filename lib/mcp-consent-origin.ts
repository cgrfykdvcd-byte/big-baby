// A consent page can be opened in an opaque-origin browser context. In that
// case browsers send Origin: null even for the form's same-site navigation.
// Fetch Metadata is browser-controlled; cross-site and scripted POSTs must
// still supply the usual exact Origin.
export function trustedConsentOrigin(request:Request,origin:string){
 const submitted=request.headers.get("origin");
 if(submitted===origin)return true;
 return submitted==="null" && request.headers.get("sec-fetch-site")==="same-origin" &&
  request.headers.get("sec-fetch-mode")==="navigate" && request.headers.get("sec-fetch-dest")==="document";
}
