"use client";
import { useEffect, useState } from "react";
import { api } from "../lib/client";
import { rentalMoney } from "../lib/rentals";
import { destinationSnapshot, receivingTitle, type OwnerPaymentMethod, type PaymentDestination } from "../lib/owner-payment-methods";
import { ReceivingAccount } from "./owner-payment-methods";
export function PayOwner({billId,remainingCents,owner,report}:{billId:string;remainingCents:number;owner:boolean;report:(destination?:PaymentDestination)=>void}){
  const[methods,setMethods]=useState<OwnerPaymentMethod[]|null>(null),[selected,setSelected]=useState(""),[error,setError]=useState(""),[reload,setReload]=useState(0);
  useEffect(()=>{let cancelled=false;setMethods(null);setError("");void api<{methods:OwnerPaymentMethod[]}>(`/api/rentals/bills/${billId}/payment-options`,undefined,"GET").then(result=>{if(!cancelled){setMethods(result.methods);setSelected(previous=>result.methods.some(method=>method.id===previous)?previous:result.methods[0]?.id||"");}}).catch(cause=>{if(!cancelled)setError(cause instanceof Error?cause.message:"Payment details could not be loaded.");});return()=>{cancelled=true;};},[billId,reload]);
  const current=methods?.find(method=>method.id===selected);
  if(owner)return<section className="pay-owner" aria-label="Payment details for your renter"><p className="eyebrow">Receiving rent</p><h3>{methods?.length?"Your renter can pay directly":"Add your payment details"}</h3><p>{methods?.length?methods.map(receivingTitle).join(" · "):"Save your GCash, bank details or receiving QR once, so renters can find them on their bills."}</p><a className="button secondary" href="/?view=rentals&rentalTab=payments">Manage payment options</a></section>;
  return<section className="pay-owner" aria-label="Pay the owner"><p className="eyebrow">Pay directly to your owner</p><h3>Choose how to pay</h3><p className="pay-owner-amount">{rentalMoney(remainingCents)}</p><p>Remaining rent. Use the payment option agreed with your owner.</p>
    {!methods&&!error&&<p role="status">Loading the owner’s payment details…</p>}
    {error&&<><p className="form-error" role="alert">{error}</p><button className="button secondary" onClick={()=>setReload(value=>value+1)}>Try again</button></>}
    {methods&&methods.length===0&&<p className="pay-owner-note">The owner has not added payment details here yet. Ask the owner how to pay. You can still report a payment you have already made.</p>}
    {!!methods?.length&&<><div className="pay-owner-options" role="radiogroup" aria-label="Owner payment options">{methods.map(method=><button type="button" role="radio" aria-checked={selected===method.id} key={method.id} onClick={()=>setSelected(method.id)}>{receivingTitle(method)}</button>)}</div>{current&&<><h4 className="pay-owner-selected-title">{receivingTitle(current)}</h4><ReceivingAccount method={current}/><p className="pay-owner-updated">Owner’s details updated {new Date(current.updatedAt).toLocaleDateString("en-PH",{timeZone:"Asia/Manila"})}.</p></>}</>}
    <p className="pay-owner-note">Check the recipient name before sending. After paying, send your amount and reference here. The owner will confirm receipt.</p>
    <button className="button primary" disabled={methods===null} onClick={()=>report(current?destinationSnapshot(current):undefined)}>I’ve paid the owner</button>
  </section>;
}
