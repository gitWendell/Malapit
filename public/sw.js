/* Only the generic offline help page is cached. Account pages and rental data stay on the network. */
const CACHE_PREFIX = "malapit-offline-";
const CACHE_NAME = CACHE_PREFIX + "v2";
const OFFLINE_PAGE = "/offline.html";

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const response = await fetch(OFFLINE_PAGE, { cache: "reload", credentials: "same-origin" });
    if (!response.ok || response.redirected || !response.headers.get("content-type")?.includes("text/html") || !(await response.clone().text()).includes("data-malapit-offline")) {
      throw new Error("The offline help page could not be loaded.");
    }
    const cache = await caches.open(CACHE_NAME);
    await cache.put(OFFLINE_PAGE, response);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request, url = new URL(request.url);
  // Leave API calls, writes, sign-in/out, and all cross-origin traffic untouched.
  if (request.method !== "GET" || request.mode !== "navigate" || url.origin !== self.location.origin || url.pathname !== "/") return;
  event.respondWith((async () => {
    try { return await fetch(request); }
    catch {
      const fallback = await (await caches.open(CACHE_NAME)).match(OFFLINE_PAGE);
      return fallback || new Response("You are offline. Reconnect to browse current rentals.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  })());
});

// The encrypted push contains an identifier only. Resolve its content through
// the current session so a signed-out or different account sees no private data.
async function currentNotification(id) {
  if(typeof id!=="string"||!/^[a-zA-Z0-9:_-]{1,200}$/.test(id))return null;
  const response=await fetch("/api/notifications/"+encodeURIComponent(id),{credentials:"same-origin",cache:"no-store",signal:AbortSignal.timeout(10000)});
  if(!response.ok)return null;
  const result=await response.json(),item=result.notification;
  if(!item||typeof item.href!=="string"||!item.href.startsWith("/?view="))return null;
  return item;
}
self.addEventListener("push",event=>{
  event.waitUntil((async()=>{
    let id=null,item=null;
    try{id=event.data?.json()?.id;item=await currentNotification(id);}catch{/* Offline or expired sessions get a generic account-free alert. */}
    await self.registration.showNotification(item?.title||"Malapit update",{
      body:item?.body||"Open Malapit to check your rental updates.",icon:"/icons/icon-192.png",badge:"/icons/icon-192.png",
      tag:item?"malapit:"+item.id:"malapit-update",data:{id:item?.id||null},
    });
    const windows=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    windows.forEach(client=>client.postMessage({type:"malapit-notification"}));
  })());
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    let item=null;
    try{
      item=await currentNotification(event.notification.data?.id);
      if(item)await fetch("/api/notifications",{method:"PATCH",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:item.id})});
    }catch{/* The account and destination perform their own checks on reconnect. */}
    const target=new URL(item?.href||"/?view=notifications",self.location.origin).href;
    const windows=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    for(const client of windows){
      if(new URL(client.url).origin===self.location.origin&&"navigate" in client){
        try{const opened=await client.navigate(target);if(opened){await opened.focus();return;}}catch{/* A closed tab can be replaced below. */}
      }
    }
    await self.clients.openWindow(target);
  })());
});
