import { allowedPushEndpoint, base64Url, base64UrlBytes } from "./notifications.ts";

const encode = (text: string) => new TextEncoder().encode(text);
function concat(...parts: Uint8Array[]) { const bytes = new Uint8Array(parts.reduce((n,p) => n + p.length,0)); let offset=0; for(const part of parts){bytes.set(part,offset);offset+=part.length;} return bytes; }
async function hkdf(material: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, length: number) {
  const key = await crypto.subtle.importKey("raw", material, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name:"HKDF", hash:"SHA-256", salt, info },key,length*8));
}

// RFC 8291 / RFC 8188, one final aes128gcm record. Only generic notification
// text and a private record identifier are sent; names, amounts and accounts aren't.
export async function encryptPush(p256dh: string, auth: string, payload: string) {
  const message=encode(payload);
  if(message.length>2048) throw new Error("Push message is too large.");
  const peerBytes=base64UrlBytes(p256dh), authBytes=base64UrlBytes(auth);
  if(peerBytes.length!==65||peerBytes[0]!==4||authBytes.length!==16)throw new Error("Invalid push keys.");
  const peer=await crypto.subtle.importKey("raw",peerBytes,{name:"ECDH",namedCurve:"P-256"},false,[]);
  const ephemeral=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveBits"]);
  const publicKey=new Uint8Array(await crypto.subtle.exportKey("raw",ephemeral.publicKey));
  const shared=new Uint8Array(await crypto.subtle.deriveBits({name:"ECDH",public:peer},ephemeral.privateKey,256));
  const ikm=await hkdf(shared,authBytes,concat(encode("WebPush: info\0"),peerBytes,publicKey),32);
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const contentKey=await hkdf(ikm,salt,encode("Content-Encoding: aes128gcm\0"),16);
  const nonce=await hkdf(ikm,salt,encode("Content-Encoding: nonce\0"),12);
  const aes=await crypto.subtle.importKey("raw",contentKey,{name:"AES-GCM"},false,["encrypt"]);
  const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv:nonce,tagLength:128},aes,concat(message,new Uint8Array([2]))));
  // salt (16), record size 4096 (uint32), sender public-key length, public key.
  return concat(salt,new Uint8Array([0,0,16,0,65]),publicKey,ciphertext);
}

export type VapidConfig = { publicKey: string; privateKey: string; subject: string };
export async function vapidAuthorization(endpoint: string, config: VapidConfig, now = new Date()) {
  if(!allowedPushEndpoint(endpoint))throw new Error("Unsupported push destination.");
  const raw=base64UrlBytes(config.publicKey);
  if(raw.length!==65||raw[0]!==4||base64UrlBytes(config.privateKey).length!==32||!/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.subject))throw new Error("Push delivery is not configured.");
  const key=await crypto.subtle.importKey("jwk",{kty:"EC",crv:"P-256",x:base64Url(raw.slice(1,33)),y:base64Url(raw.slice(33)),d:config.privateKey},{name:"ECDSA",namedCurve:"P-256"},false,["sign"]);
  const token=base64Url(encode(JSON.stringify({typ:"JWT",alg:"ES256"})))+"."+base64Url(encode(JSON.stringify({aud:new URL(endpoint).origin,exp:Math.floor(now.getTime()/1000)+12*3600,sub:config.subject})));
  const signature=new Uint8Array(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},key,encode(token)));
  return `vapid t=${token}.${base64Url(signature)}, k=${config.publicKey}`;
}
export async function sendWebPush(subscription: { endpoint: string; p256dh: string; auth: string }, payload: string, config: VapidConfig, fetcher: typeof fetch = fetch) {
  const authorization=await vapidAuthorization(subscription.endpoint,config);
  const body=await encryptPush(subscription.p256dh,subscription.auth,payload);
  const response=await fetcher(subscription.endpoint,{method:"POST",headers:{Authorization:authorization,"Content-Encoding":"aes128gcm","Content-Type":"application/octet-stream",TTL:"86400",Urgency:"normal"},body,redirect:"manual",signal:AbortSignal.timeout(10000)});
  const status=response.status;
  await response.body?.cancel();
  return status;
}
