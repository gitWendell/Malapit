"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { LoaderCircle, MessageCircle, RefreshCw, Send } from "lucide-react";
import { api } from "../lib/client";
import type { AppData, Inquiry } from "../lib/types";
import type { InquiryMessage, InquiryMessagesPage } from "../lib/inquiry-messages";
import { Empty } from "./ui";
import "./inquiry-inbox.css";

const messageDate = (value: string) => new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }).format(new Date(value));
const errorText = (error: unknown) => error instanceof Error ? error.message : "Please try again.";
const mergeMessages = (previous: InquiryMessage[], incoming: InquiryMessage[]) => [...new Map([...previous, ...incoming].map(message => [message.id, message])).values()].sort((a, b) => a.seq - b.seq);

export default function InquiryInbox({ data, refresh, notify }: { data: AppData; refresh: () => Promise<void>; notify: (text: string, error?: boolean) => void }) {
  const [active, setActive] = useState(""), [refreshing, setRefreshing] = useState(false);
  const actions = useRef({ refresh, notify }); actions.current = { refresh, notify };
  useEffect(() => { setActive(new URLSearchParams(window.location.search).get("inquiry") || ""); }, [data.session?.userId]);
  useEffect(() => { const timer = setInterval(() => { if (document.visibilityState === "visible") void actions.current.refresh().catch(() => {}); }, 30000); return () => clearInterval(timer); }, []);
  async function reload() { setRefreshing(true); try { await refresh(); } catch (error) { notify(errorText(error), true); } finally { setRefreshing(false); } }
  function toggle(id: string) {
    const next = active === id ? "" : id; setActive(next);
    const url = new URL(window.location.href); if (next) url.searchParams.set("inquiry", next); else url.searchParams.delete("inquiry"); window.history.replaceState(null, "", url);
  }
  if (!data.inquiries.length) return <Empty title="No inquiries yet" description="Your rental conversations will appear here." />;
  return <><div className="conversation-toolbar"><p>Continue the conversation to ask questions or arrange a viewing.</p><button className="button secondary" disabled={refreshing} onClick={() => void reload()}><RefreshCw size={16} className={refreshing ? "spin" : ""} />Refresh conversations</button></div><div className="inbox-list">{data.inquiries.map(item => <ConversationCard key={item.id + ":" + data.session?.userId} item={item} userId={data.session!.userId} open={active === item.id} toggle={() => toggle(item.id)} refresh={refresh} notify={notify} />)}</div></>;
}

function ConversationCard({ item, userId, open, toggle, refresh, notify }: { item: Inquiry; userId: string; open: boolean; toggle: () => void; refresh: () => Promise<void>; notify: (text: string, error?: boolean) => void }) {
  const [messages, setMessages] = useState<InquiryMessage[]>([]), [legacyReply, setLegacyReply] = useState("");
  const [ready, setReady] = useState(false), [error, setError] = useState(""), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [earlier, setEarlier] = useState(false), [loadingEarlier, setLoadingEarlier] = useState(false), [body, setBody] = useState("");
  const revision = useRef(0), active = useRef(false), initialized = useRef(false), latest = useRef(0), polling = useRef(false), followBottom = useRef(true), history = useRef<HTMLDivElement>(null), pending = useRef<{ requestId: string; body: string } | null>(null);
  const loadLatest = useCallback(async () => {
    if (!active.current || !initialized.current || polling.current) return;
    const request = revision.current; polling.current = true;
    try {
      const page = await api<InquiryMessagesPage>(`/api/inquiries/${item.id}/messages?after=${latest.current}`, undefined, "GET");
      if (revision.current !== request || !active.current) return;
      setMessages(previous => mergeMessages(previous, page.messages)); setLegacyReply(page.legacyReply); setError("");
      if (page.messages.length) latest.current = page.messages[page.messages.length - 1].seq;
    } catch (cause) { if (revision.current === request && active.current) setError(errorText(cause)); }
    finally { if (revision.current === request) polling.current = false; }
  }, [item.id]);
  useEffect(() => {
    const request = ++revision.current; active.current = open; initialized.current = false; polling.current = false;
    if (!open) return;
    followBottom.current = true; latest.current = 0; setReady(false); setError(""); setLoading(true); setMessages([]);
    void api<InquiryMessagesPage>(`/api/inquiries/${item.id}/messages`, undefined, "GET").then(page => {
      if (revision.current !== request || !active.current) return;
      setMessages(page.messages); setLegacyReply(page.legacyReply); setEarlier(page.hasMore); initialized.current = true; setReady(true);
      latest.current = page.messages.at(-1)?.seq || 0;
    }).catch(cause => { if (revision.current === request) setError(errorText(cause)); }).finally(() => { if (revision.current === request) setLoading(false); });
    const resume = () => { if (document.visibilityState === "visible") void loadLatest(); };
    const timer = setInterval(resume, 15000); window.addEventListener("focus", resume); document.addEventListener("visibilitychange", resume);
    return () => { active.current = false; revision.current++; clearInterval(timer); window.removeEventListener("focus", resume); document.removeEventListener("visibilitychange", resume); };
  }, [open, item.id, loadLatest]);
  useLayoutEffect(() => { const element = history.current; if (element && followBottom.current) element.scrollTop = element.scrollHeight; }, [messages, ready]);
  async function older() {
    if (!messages.length || loadingEarlier) return;
    const request = revision.current, element = history.current, previousHeight = element?.scrollHeight || 0, previousTop = element?.scrollTop || 0;
    setLoadingEarlier(true); followBottom.current = false;
    try { const page = await api<InquiryMessagesPage>(`/api/inquiries/${item.id}/messages?before=${messages[0].seq}`, undefined, "GET"); if (request !== revision.current) return; setMessages(previous => mergeMessages(previous, page.messages)); setEarlier(page.hasMore); requestAnimationFrame(() => { if (element && request === revision.current) element.scrollTop = previousTop + element.scrollHeight - previousHeight; }); }
    catch (cause) { if (request === revision.current) setError(errorText(cause)); }
    finally { setLoadingEarlier(false); }
  }
  async function send(event: React.FormEvent) {
    event.preventDefault(); if (busy || !ready) return;
    const text = body.trim(); if (!text) { setError("Write a message first."); return; }
    if (!pending.current || pending.current.body !== text) pending.current = { requestId: crypto.randomUUID(), body: text };
    setBusy(true); setError("");
    try {
      const result = await api<{ message: InquiryMessage }>(`/api/inquiries/${item.id}/messages`, pending.current);
      followBottom.current = true; setMessages(previous => mergeMessages(previous, [result.message])); setBody(""); pending.current = null; notify(item.isDemo ? "Demo message saved. No owner was contacted." : "Message sent.");
      await loadLatest(); await refresh().catch(() => {});
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  const preview = item.lastMessage;
  return <article className={`inquiry-item conversation-card ${open ? "is-open" : ""}`}>
    <div className="inquiry-item-heading"><span className="lister-avatar"><MessageCircle size={22} /></span><div><span className="eyebrow">{item.isDemo ? "DEMO INQUIRY" : item.renterId === userId ? "YOUR INQUIRY" : "RENTER INQUIRY"}</span><h3>{item.listingTitle}</h3></div><time>{new Date(item.createdAt).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })}</time></div>
    <div className="inquiry-message"><strong>{item.renterName}</strong><p>{item.message}</p><span>Move-in: {item.moveIn} · {item.occupants} occupant{item.occupants > 1 ? "s" : ""}</span></div>
    {!open && (preview || item.reply) && <div className="inquiry-reply"><strong>{preview ? `${preview.senderName} · ${preview.role === "owner" ? "Lister" : preview.role === "renter" ? "Renter" : "Reviewer"}` : "Lister reply"}</strong><p>{preview?.body || item.reply}</p></div>}
    <div className="conversation-actions"><button className="button primary" aria-expanded={open} onClick={toggle}><MessageCircle size={16} />{open ? "Hide conversation" : preview || item.reply ? "Reply" : item.renterId === userId ? "Open conversation" : "Reply to renter"}</button></div>
    {open && <section className="conversation-thread" aria-label={`Conversation about ${item.listingTitle}`}>
      {loading && <p className="conversation-loading" role="status"><LoaderCircle size={17} className="spin" />Loading conversation…</p>}
      {ready && <><div className="conversation-history" ref={history} onScroll={event => { const element = event.currentTarget; followBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80; }}>
        {legacyReply && <div className="conversation-message"><strong>Earlier lister reply</strong><p>{legacyReply}</p></div>}
        {earlier && <button className="text-link conversation-older" disabled={loadingEarlier} onClick={() => void older()}>{loadingEarlier ? "Loading…" : "Load earlier messages"}</button>}
        {messages.map(message => <div key={message.id} className={`conversation-message ${message.senderId === userId ? "is-mine" : ""}`}><div className="conversation-message-meta"><strong>{message.senderId === userId ? "You" : message.senderName}<span>{message.role === "owner" ? "Lister" : message.role === "renter" ? "Renter" : "Reviewer"}</span></strong><time dateTime={message.createdAt}>{messageDate(message.createdAt)}</time></div><p>{message.body}</p></div>)}
        {!legacyReply && !messages.length && <p className="conversation-empty">{item.renterId === userId ? "Your inquiry is above. You can add another message here." : "Reply here to answer questions or suggest a viewing."}</p>}
      </div><form className="conversation-compose" onSubmit={send}><label className="field"><span>Your message</span><textarea autoFocus name="message" aria-label={`Message about ${item.listingTitle}`} rows={3} required maxLength={2000} disabled={busy} placeholder="Ask a question or arrange a viewing…" value={body} onChange={event => setBody(event.target.value)} /></label><div><small>{body.length}/2,000</small><button className="button primary" disabled={busy || !body.trim()} type="submit">{busy ? <LoaderCircle size={16} className="spin" /> : <Send size={16} />}{busy ? "Sending…" : "Send message"}</button></div></form><p className="conversation-note">Replies update while this conversation is open. Email, SMS and phone notifications are not sent.</p></>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {error && !ready && !loading && <button className="button secondary" onClick={() => { toggle(); }}>Close and try again</button>}
    </section>}
    {Boolean(item.isDemo) && <p className="form-help">Demo conversation only. No owner is contacted.</p>}
  </article>;
}
