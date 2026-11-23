"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellOff, CheckCheck, LoaderCircle, RefreshCw, Smartphone } from "lucide-react";
import { api } from "../lib/client";
import { base64UrlBytes, type NotificationItem, type NotificationPage, type PushSettings } from "../lib/notifications";
import type { Session } from "../lib/types";
import { Modal } from "./ui";
import "./notifications.css";

const errorText=(error:unknown)=>error instanceof Error?error.message:"Please try again.";
const dateLabel=(value:string)=>new Intl.DateTimeFormat("en-PH",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(value));
export default function Notifications({session}:{session:Session}){
  const [open,setOpen]=useState(false),[data,setData]=useState<NotificationPage|null>(null),[error,setError]=useState("");
  const [busy,setBusy]=useState(false),[settings,setSettings]=useState<PushSettings|null>(null),[supported,setSupported]=useState(false),[permission,setPermission]=useState<NotificationPermission>("default"),[status,setStatus]=useState("");
  const version=useRef(0),id=session?.userId;
  const refresh=useCallback(async()=>{
    const current=++version.current;
    const result=await api<NotificationPage>("/api/notifications",undefined,"GET");
    if(current===version.current){setData(result);setError("");}
  },[]);
  useEffect(()=>{
    setData(null);setSettings(null);setError("");setStatus("");setOpen(false);
    if(!id)return;
    let alive=true;
    const update=()=>{if(document.visibilityState==="visible")void refresh().catch(cause=>{if(alive)setError(errorText(cause));});};
    update();
    if(new URLSearchParams(window.location.search).get("view")==="notifications")setOpen(true);
    setSupported(window.isSecureContext&&"Notification" in window&&"PushManager" in window&&"serviceWorker" in navigator);
    if("Notification" in window)setPermission(Notification.permission);
    const timer=setInterval(update,60000);
    const message=(event:MessageEvent)=>{if(event.data?.type==="malapit-notification")update();};
    window.addEventListener("focus",update);document.addEventListener("visibilitychange",update);navigator.serviceWorker?.addEventListener("message",message);
    return()=>{alive=false;version.current++;clearInterval(timer);window.removeEventListener("focus",update);document.removeEventListener("visibilitychange",update);navigator.serviceWorker?.removeEventListener("message",message);};
  },[id,refresh]);
  useEffect(()=>{
    if(!open||!id)return;
    let alive=true;
    void api<PushSettings>("/api/notifications/push",undefined,"GET").then(result=>{if(alive)setSettings(result);}).catch(cause=>{if(alive)setError(errorText(cause));});
    if("Notification" in window)setPermission(Notification.permission);
    return()=>{alive=false;};
  },[open,id]);
  async function more(){
    if(!data)return;setBusy(true);
    try{const result=await api<NotificationPage>("/api/notifications?page="+(data.page+1),undefined,"GET");setData(previous=>previous?{...result,items:[...previous.items,...result.items.filter(item=>!previous.items.some(old=>old.id===item.id))]}:result);}
    catch(cause){setError(errorText(cause));}finally{setBusy(false);}
  }
  async function readAll(){
    if(!data)return;setBusy(true);
    try{await api("/api/notifications",{through:data.through},"PATCH");await refresh();}catch(cause){setError(errorText(cause));}finally{setBusy(false);}
  }
  async function follow(item:NotificationItem){
    setBusy(true);
    try{await api("/api/notifications",{id:item.id},"PATCH");}catch{/* The destination still checks its own permissions and current state. */}
    window.location.assign(item.href);
  }
  async function enable(){
    if(!supported||!settings?.publicKey)return;
    setBusy(true);setError("");setStatus("");
    let created:PushSubscription|null=null;
    try{
      const allowed=await Notification.requestPermission();setPermission(allowed);
      if(allowed!=="granted"){setStatus("Updates stay available in this bell. You can change notification permission in your browser settings.");return;}
      await navigator.serviceWorker.register("/sw.js",{scope:"/",updateViaCache:"none"});
      const registration=await Promise.race([navigator.serviceWorker.ready,new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error("The notification service isn't ready. Refresh Malapit and try again.")),15000))]);
      let subscription=await registration.pushManager.getSubscription();
      if(!subscription){subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64UrlBytes(settings.publicKey)});created=subscription;}
      await api("/api/notifications/push",subscription.toJSON());
      setSettings(previous=>previous?{...previous,enabled:true}:previous);
      setStatus("Notifications are on for this browser. Send a test alert to check your device.");
    }catch(cause){if(created)await created.unsubscribe().catch(()=>{});setError(errorText(cause));}finally{setBusy(false);}
  }
  async function disable(){
    setBusy(true);setError("");
    try{
      await api("/api/notifications/push",undefined,"DELETE");
      const registration=await navigator.serviceWorker.getRegistration("/");
      await (await registration?.pushManager.getSubscription())?.unsubscribe();
      const shown=await registration?.getNotifications();shown?.forEach(notification=>notification.close());
      setSettings(previous=>previous?{...previous,enabled:false}:previous);setStatus("Phone notifications are off on this browser. Your updates remain in the bell.");
    }catch(cause){setError(errorText(cause));}finally{setBusy(false);}
  }
  async function testAlert(){
    setBusy(true);setError("");
    try{await api("/api/notifications/push/test",{});setStatus("Test alert queued. Check your device's notifications; delivery depends on your browser and connection.");await refresh();}
    catch(cause){setError(errorText(cause));}finally{setBusy(false);}
  }
  if(!session)return null;
  return <>
    <button className="notifications-trigger" aria-label={`Notifications${data?.unread?`, ${data.unread} unread`:""}`} title="Notifications" onClick={()=>{setOpen(true);void refresh().catch(cause=>setError(errorText(cause)));}}><Bell size={20}/>{!!data?.unread&&<span>{data.unread>99?"99+":data.unread}</span>}</button>
    {open&&<Modal title="Notifications" className="notifications-modal" onClose={()=>{setOpen(false);const url=new URL(window.location.href);if(url.searchParams.get("view")==="notifications"){url.searchParams.delete("view");window.history.replaceState(null,"",url);}}}>
      <div className="notifications-content">
        <section className="notification-device" aria-label="Phone notifications"><Smartphone size={22}/><div><h3>Keep up with your rental</h3><p>Get alerts for messages, rental details, bills and payment updates. Tap an alert to open the right page.</p>
          {!supported?<p className="notification-hint">Use a browser that supports notifications, such as Chrome on Android. On iPhone, add Malapit to your home screen first. Your updates are always available here.</p>
            :!settings?<p className="notification-hint">Checking this device…</p>
            :!settings.publicKey?<p className="notification-hint">Phone alerts are being prepared. Your updates are available below.</p>
            :permission==="denied"&&!settings.enabled?<p className="notification-hint">Notifications are blocked in this browser. Allow them in the site's browser settings, then reopen this panel.</p>
            :<div className="notification-device-actions">{settings.enabled?<><span><CheckCheck size={16}/>{permission==="denied"?"Saved; browser alerts blocked":"On for this browser"}</span><button className="text-button" disabled={busy||permission==="denied"} onClick={testAlert}>Send test alert</button><button className="text-button" disabled={busy} onClick={disable}><BellOff size={15}/>Turn off</button></>:<button className="button primary" disabled={busy} onClick={enable}><Bell size={16}/>{busy?"Connecting…":"Turn on notifications"}</button>}</div>}
        </div></section>
        {status&&<p className="notification-status" role="status">{status}</p>}
        <div className="notifications-toolbar"><h3>Your updates{data?` (${data.unread} unread)`:""}</h3><div><button className="icon-button" aria-label="Refresh notifications" disabled={busy} onClick={()=>void refresh().catch(cause=>setError(errorText(cause)))}><RefreshCw size={17}/></button><button className="text-button" disabled={busy||!data?.unread} onClick={readAll}>Mark all read</button></div></div>
        {error&&<p className="notification-error" role="alert">{error}</p>}
        {!data&&!error?<p className="notification-empty"><LoaderCircle className="spin" size={19}/>Loading your updates…</p>:data?.items.length?<ul className="notification-list">{data.items.map(item=><li key={item.id}><button disabled={busy} className={item.readAt?"is-read":"is-unread"} onClick={()=>void follow(item)}><span className="notification-item-icon"><Bell size={18}/></span><span><strong>{item.title}</strong><p>{item.body}</p><time dateTime={item.createdAt}>{dateLabel(item.createdAt)}</time></span>{!item.readAt&&<span className="notification-unread" aria-label="Unread"/>}</button></li>)}</ul>:!error&&<div className="notification-empty"><Bell size={26}/><strong>You’re all caught up</strong><p>New messages, rental invitations, bills and payment updates will appear here.</p></div>}
        {data?.hasMore&&<button className="button secondary notification-more" disabled={busy} onClick={more}>Load earlier updates</button>}
        <p className="notification-footnote">Updates are kept here for 60 days. Your rental and payment history stays in My Rentals. Phone alerts depend on browser permission and delivery. No SMS or email alerts are sent.</p>
      </div>
    </Modal>}
  </>;
}
