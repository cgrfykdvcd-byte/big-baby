'use client';
import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { api } from '@/lib/client-api';
import { t, type Language } from '@/lib/i18n';
import { toast } from 'sonner';
type Credential={id:string;status:string;created_at:string;revoked_at?:string|null;last_used_at?:string|null};
export default function ChatGptIntegrationPanel({language}:{language:Language}){
 const [credentials,setCredentials]=useState<Credential[]>([]),[secret,setSecret]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[revoke,setRevoke]=useState<string|null>(null);
 const load=async()=>{try{const r=await api<{credentials:Credential[]}>('/api/integrations/chatgpt');setCredentials(r.credentials||[])}catch(e){setError(e instanceof Error?e.message:t(language,'integrationLoadFailed'))}};
 /* The initial fetch synchronizes this panel with the authenticated server state. */
 /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
 useEffect(()=>{void load()},[]);
 const create=async()=>{setBusy(true);setError('');try{const r=await api<{access_token:string}>('/api/integrations/chatgpt',{action:'create_credential'});setSecret(r.access_token);await load()}catch(e){setError(e instanceof Error?e.message:t(language,'integrationCreateFailed'))}finally{setBusy(false)}};
 const copy=async()=>{if(!secret)return;try{await navigator.clipboard.writeText(secret);toast.success(t(language,'credentialCopied'))}catch{toast.error(t(language,'credentialCopyFailed'))}};
 const revokeCredential=async()=>{if(!revoke)return;setBusy(true);setError('');try{await api('/api/integrations/chatgpt',{action:'revoke_credential',credential_id:revoke});setRevoke(null);await load();toast.success(t(language,'credentialRevoked'))}catch(e){setError(e instanceof Error?e.message:t(language,'credentialRevokeFailed'))}finally{setBusy(false)}};
 const active=credentials.filter(c=>c.status==='active').length, status=active?'connected':credentials.length?'revoked':'not-connected';
 return <section className="settings-block integration-management"><div className="integration-heading"><div><h3>{t(language,'externalIntegrations')}</h3><p>{t(language,'chatgptPurpose')}</p></div><span className={'status-chip '+(status==='connected'?'is-connected':'')}>{t(language,status==='connected'?'integrationConnected':status==='revoked'?'integrationRevoked':'integrationNotConnected')}</span></div>
  <div className="integration-provider"><div className="provider-icon"><KeyRound size={20}/></div><div className="provider-copy"><strong>ChatGPT</strong><p>{active>0?t(language,'activeCredentialCount').replace('{count}',String(active)):t(language,'chatgptNotConnected')}</p></div><button className="primary-button compact" disabled={busy} onClick={()=>void create()}>{busy?<Loader2 size={15} className="spin"/>:<Check size={15}/>} {t(language,'connectChatGPT')}</button></div>
  <p className="integration-note">{t(language,'chatgptSafetyIntro')}</p><ul className="integration-safety"><li><ShieldCheck size={16}/>{t(language,'chatgptSafetyExplicit')}</li><li><ShieldCheck size={16}/>{t(language,'chatgptSafetyHistory')}</li><li><ShieldCheck size={16}/>{t(language,'chatgptSafetyReview')}</li><li><ShieldCheck size={16}/>{t(language,'chatgptSafetyRevoke')}</li></ul>
  <div className="integration-example"><small>{t(language,'chatgptExampleLabel')}</small><strong>{t(language,'chatgptExample')}</strong><p>{t(language,'chatgptExampleNote')}</p></div>
  {secret&&<div className="credential-once"><strong>{t(language,'credentialOnceWarning')}</strong><code>{secret}</code><div className="button-row"><button className="outline-button" onClick={()=>void copy()}><Copy size={16}/>{t(language,'copyCredential')}</button><button className="quiet-button" onClick={()=>setSecret(null)}>{t(language,'closeCredential')}</button></div></div>}
  {error&&<p className="inline-error" role="alert">{error}</p>}
  {credentials.length>0&&<div className="credential-list"><h4>{t(language,'credentialList')}</h4>{credentials.map(c=><div className="credential-row" key={c.id}><span className={'credential-dot '+(c.status==='active'?'active':'')}/><div><strong>{t(language,c.status==='active'?'integrationConnected':'integrationRevoked')}</strong><small>{t(language,'createdAt')}: {new Date(c.created_at).toLocaleString()}</small>{c.last_used_at&&<small>{t(language,'lastUsedAt')}: {new Date(c.last_used_at).toLocaleString()}</small>}</div>{c.status==='active'&&<button className="quiet-button danger-text" disabled={busy} onClick={()=>setRevoke(c.id)}><Trash2 size={15}/>{t(language,'revokeCredential')}</button>}</div>)}</div>}
  <AlertDialog open={!!revoke} onOpenChange={open=>{if(!open)setRevoke(null)}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t(language,'revokeCredential')}?</AlertDialogTitle><AlertDialogDescription>{t(language,'revokeWarning')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t(language,'cancel')}</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={e=>{e.preventDefault();void revokeCredential()}}>{t(language,'revokeCredential')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </section>;
}
