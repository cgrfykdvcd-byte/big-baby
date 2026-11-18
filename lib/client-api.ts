export async function api<T=Record<string,unknown>>(path:string,body?:unknown,method='POST'):Promise<T>{
 const response=await fetch(path,body!==undefined?{method,headers:{'Content-Type':'application/json','x-campus-action':'1'},body:JSON.stringify(body)}:{cache:'no-store'});let data:Record<string,unknown>;try{data=await response.json() as Record<string,unknown>}catch{throw Error('服务暂时不可用，请稍后重试。')}if(!response.ok)throw Error(String(data.error||'操作失败，请重试。'));return data as T;
}
