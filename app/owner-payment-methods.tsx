"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, ImagePlus, LoaderCircle, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { api } from "../lib/client";
import { receivingCreate, receivingKinds, receivingTitle, type OwnerPaymentMethod, type PaymentDestination, type ReceivingDetails } from "../lib/owner-payment-methods";
import { preparePaymentQr } from "../lib/payment-qr-upload";
import "./owner-payment-methods.css";
const message=(error:unknown)=>error instanceof Error?error.message:"Please try again.";
const blank:ReceivingDetails={kind:"gcash",label:"",accountName:"",accountNumber:"",instructions:"",qrImageId:null};
const qrUrl=(id:string)=>`/api/rentals/payment-qrs/${id}`;

export function ReceivingAccount({method,preview=false}:{method:OwnerPaymentMethod|PaymentDestination;preview?:boolean}){
  const[copied,setCopied]=useState("");
  async function copy(value:string,name:string){try{await navigator.clipboard.writeText(value);setCopied(name+" copied.");}catch{setCopied("Copy is unavailable. Select the details below to copy them.");}}
  return <div className="receiving-account">
    {method.accountName&&<div className="receiving-data"><span>Account name</span><strong>{method.accountName}</strong><button type="button" className="receiving-copy" aria-label="Copy account name" onClick={()=>void copy(method.accountName,"Account name")}><Copy size={16}/><span>Copy</span></button></div>}
    {method.accountNumber&&<div className="receiving-data"><span>{["gcash","maya"].includes(method.kind)?"Mobile number":method.kind==="other"?"Receiving account":"Account number"}</span><strong>{method.accountNumber}</strong><button type="button" className="receiving-copy" aria-label="Copy account number" onClick={()=>void copy(method.accountNumber,"Account number")}><Copy size={16}/><span>Copy</span></button></div>}
    {method.instructions&&<p className="receiving-instructions">{method.instructions}</p>}
    {method.qrImageId&&<div className="receiving-qr"><img src={qrUrl(method.qrImageId)} alt={receivingTitle(method)+" receiving QR image"}/>{!preview&&<><a className="button secondary" href={qrUrl(method.qrImageId)} download="Malapit-payment-QR.png">Save QR image</a><p>Open your bank or wallet app and use its scan or image-upload option. Check the recipient and amount before paying.</p></>}</div>}
    {copied&&<p className="receiving-copy-status" role="status">{copied}</p>}
  </div>;
}
export function OwnerPaymentSettings(){
  const[methods,setMethods]=useState<OwnerPaymentMethod[]|null>(null),[editing,setEditing]=useState<OwnerPaymentMethod|"new"|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[removeId,setRemoveId]=useState("");
  async function load(){setMethods((await api<{methods:OwnerPaymentMethod[]}>("/api/rentals/payment-methods",undefined,"GET")).methods);}
  useEffect(()=>{let cancelled=false;void api<{methods:OwnerPaymentMethod[]}>("/api/rentals/payment-methods",undefined,"GET").then(result=>{if(!cancelled)setMethods(result.methods);}).catch(cause=>{if(!cancelled)setError(message(cause));});return()=>{cancelled=true;};},[]);
  async function archive(method:OwnerPaymentMethod){setBusy(true);setError("");try{await api(`/api/rentals/payment-methods/${method.id}`,{action:"archive",version:method.updatedAt,confirmed:true},"PATCH");await load();setRemoveId("");}catch(cause){setError(message(cause));}finally{setBusy(false);}}
  return <section className="owner-receiving-settings" aria-label="Owner payment setup"><div className="rental-section-heading"><div><p className="eyebrow">For owners</p><h2>Where renters send rent</h2><p>Save your receiving details once. They appear on your renters’ unpaid bills.</p></div>{!editing&&<button className="button primary" disabled={busy||!!methods&&methods.length>=10} onClick={()=>setEditing("new")}><Plus size={17}/>Add payment option</button>}</div>
    <p className="receiving-private-note">These details are private. They are not shown on public property listings. Payments go straight to your account; you confirm receipt in Malapit.</p>
    {error&&<p className="form-error" role="alert">{error}</p>}
    {editing?<ReceivingForm key={editing==="new"?"new":editing.id} initial={editing==="new"?undefined:editing} cancel={()=>setEditing(null)} saved={async()=>{setEditing(null);setError("");await load();}}/>:methods===null?<p role="status">Loading payment options…</p>:methods.length?<div className="receiving-method-grid">{methods.map(method=><article className="receiving-method-card" key={method.id}><div className="receiving-card-heading"><span className="receiving-icon"><Wallet size={21}/></span><div><h3>{receivingTitle(method)}</h3><p>{receivingKinds[method.kind]}</p></div></div><ReceivingAccount method={method} preview/>
      <div className="receiving-card-actions"><button className="button secondary" disabled={busy} onClick={()=>setEditing(method)}><Pencil size={15}/>Edit</button><button className="text-button" disabled={busy} onClick={()=>setRemoveId(method.id)}><Trash2 size={15}/>Remove</button></div>
      {removeId===method.id&&<div className="receiving-remove"><p>Remove this option from future payment reports? Existing reports keep the details used at submission.</p><button className="button secondary" disabled={busy} onClick={()=>setRemoveId("")}>Keep option</button><button className="button primary" disabled={busy} onClick={()=>void archive(method)}>Remove option</button></div>}
    </article>)}</div>:<div className="receiving-empty"><Wallet size={30}/><h3>Add your first payment option</h3><p>Use GCash, Maya, a bank account, an existing QR code, cash or another agreed method.</p><button className="button primary" onClick={()=>setEditing("new")}>Set up payment details</button></div>}
  </section>;
}
function ReceivingForm({initial,cancel,saved}:{initial?:OwnerPaymentMethod;cancel:()=>void;saved:()=>Promise<void>}){
  const[draft,setDraft]=useState<ReceivingDetails>(initial?{kind:initial.kind,label:initial.label,accountName:initial.accountName,accountNumber:initial.accountNumber,instructions:initial.instructions,qrImageId:initial.qrImageId}:blank);
  const[file,setFile]=useState<File|null>(null),[preview,setPreview]=useState(""),[busy,setBusy]=useState(false),[preparing,setPreparing]=useState(false),[confirmed,setConfirmed]=useState(false),[error,setError]=useState("");
  const requestId=useRef(crypto.randomUUID()),uploadId=useRef(crypto.randomUUID()),imageSequence=useRef(0);
  useEffect(()=>{if(!file){setPreview("");return;}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url);},[file]);
  function update<K extends keyof ReceivingDetails>(key:K,value:ReceivingDetails[K]){setDraft(previous=>({...previous,[key]:value}));setConfirmed(false);}
  async function pick(file:File|undefined){if(!file)return;const sequence=++imageSequence.current;setPreparing(true);setError("");setConfirmed(false);try{const prepared=await preparePaymentQr(file);if(sequence===imageSequence.current){setFile(prepared);uploadId.current=crypto.randomUUID();}}catch(cause){if(sequence===imageSequence.current)setError(message(cause));}finally{if(sequence===imageSequence.current)setPreparing(false);}}
  async function submit(event:React.FormEvent){event.preventDefault();setError("");
    const parsed=receivingCreate.safeParse({requestId:requestId.current,details:{...draft,qrImageId:file?uploadId.current:draft.qrImageId},detailsConfirmed:confirmed});if(!parsed.success){setError(parsed.error.issues[0].message);return;}
    setBusy(true);try{
      let qrImageId=draft.qrImageId;
      if(file){const response=await fetch("/api/rentals/payment-qrs",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"image/png","X-Upload-Id":uploadId.current},body:file});const result=await response.json() as {id?:string;error?:string};if(!response.ok||!result.id)throw new Error(result.error||"The QR could not be uploaded.");qrImageId=result.id;}
      const details={...draft,qrImageId};
      if(initial)await api(`/api/rentals/payment-methods/${initial.id}`,{action:"update",version:initial.updatedAt,details,detailsConfirmed:true},"PATCH");
      else await api("/api/rentals/payment-methods",{requestId:requestId.current,details,detailsConfirmed:true});
      await saved();
    }catch(cause){setError(message(cause));}finally{setBusy(false);}
  }
  return <form className="receiving-form" onSubmit={submit}><h3>{initial?"Edit receiving details":"Add receiving details"}</h3><fieldset disabled={busy||preparing}><div className="form-grid">
    <label className="field"><span>Payment option</span><select value={draft.kind} onChange={event=>{imageSequence.current++;setPreparing(false);setFile(null);setDraft({...blank,kind:event.target.value as ReceivingDetails["kind"]});setConfirmed(false);}}>{Object.entries(receivingKinds).map(([kind,label])=><option key={kind} value={kind}>{label}</option>)}</select></label>
    <label className="field"><span>{draft.kind==="bank"?"Bank name":draft.kind==="other"?"Payment service":"Label (optional)"}</span><input required={["bank","other"].includes(draft.kind)} maxLength={70} placeholder={draft.kind==="bank"?"e.g. BPI, BDO or UnionBank":draft.kind==="qr"?"e.g. QR Ph from my bank":"e.g. Main receiving account"} value={draft.label} onChange={event=>update("label",event.target.value)}/></label>
    {draft.kind!=="cash"&&<><label className="field"><span>Receiving account name</span><input required minLength={2} maxLength={100} autoComplete="off" placeholder="Name shown by the bank or wallet" value={draft.accountName} onChange={event=>update("accountName",event.target.value)}/></label>
      <label className="field"><span>{["gcash","maya"].includes(draft.kind)?"Receiving mobile number":"Receiving account number"}{(draft.qrImageId||file||["qr","other"].includes(draft.kind))?" (optional)":""}</span><input autoComplete="off" inputMode={["gcash","maya"].includes(draft.kind)?"tel":"text"} maxLength={100} placeholder={["gcash","maya"].includes(draft.kind)?"09XX XXX XXXX":"Account number or receiving identifier"} value={draft.accountNumber} onChange={event=>update("accountNumber",event.target.value)}/></label></>}
  </div>
  {draft.kind!=="cash"&&<div className="receiving-qr-upload"><label className="field"><span>Receiving QR image{draft.kind==="qr"?"":" (optional)"}</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>void pick(event.target.files?.[0])}/><small>Upload the receiving QR issued by your bank or wallet. Keep the QR and its white border clear.</small></label>{(preview||draft.qrImageId)&&<div className="receiving-qr-preview"><img src={preview||qrUrl(draft.qrImageId!)} alt="Receiving QR preview"/><button type="button" className="text-button" onClick={()=>{imageSequence.current++;setFile(null);update("qrImageId",null);}}>Remove QR image</button></div>}</div>}
  <label className="field"><span>Instructions (optional)</span><textarea rows={3} maxLength={400} placeholder={draft.kind==="cash"?"Where and when should the renter hand over cash?":"e.g. Include the unit number in the transfer note."} value={draft.instructions} onChange={event=>update("instructions",event.target.value)}/><small>Receiving details only. Never enter a PIN, password or card security code.</small></label>
  <label className="check-row receiving-consent"><input type="checkbox" required checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/><span>I checked the account details and QR. I agree to show them on my renters’ unpaid bills.</span></label>
  {error&&<p className="form-error" role="alert">{error}</p>}<div className="rental-form-actions"><button type="button" className="button secondary" onClick={cancel}>Cancel</button><button type="submit" className="button primary" disabled={!confirmed||preparing}>{busy||preparing?<LoaderCircle className="spin" size={16}/>:<Check size={16}/>}Save payment option</button></div></fieldset></form>;
}
