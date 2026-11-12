"use client";
import { useState } from "react";
import { ArrowRight, Bath, BedDouble, CalendarDays, Check, ChevronLeft, ChevronRight, Flag, Heart, MapPin, Maximize, MessageCircle, Navigation, Share2, UserRound } from "lucide-react";
import type { Listing, Session } from "../lib/types";
import { money } from "../lib/types";
import { api, today } from "../lib/client";
import { Modal } from "./ui";
import AvailabilityNote from "./availability-note";
import { availabilityDate, getAvailability, isListingVisible } from "../lib/availability";

type Props = { home: Listing; now: number; session: Session; saved: boolean; onSave: () => void; onClose: () => void; onSignIn: () => void; onRefresh: () => Promise<void>; notify: (message: string, error?: boolean) => void; onManage: () => void };
export default function HomeDetail({ home, now, session, saved, onSave, onClose, onSignIn, onRefresh, notify, onManage }: Props) {
  const [photo, setPhoto] = useState(0), [inquire, setInquire] = useState(false), [busy, setBusy] = useState(false), [sent, setSent] = useState(false);
  const [reporting, setReporting] = useState(false), [reason, setReason] = useState(""), [shareLink, setShareLink] = useState("");
  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fields = new FormData(e.currentTarget); setBusy(true);
    try { const result = await api("/api/inquiries", { listingId: home.id, message: String(fields.get("message")), moveIn: fields.get("moveIn"), occupants: Number(fields.get("occupants")) }); await onRefresh(); setSent(true); notify(result.isDemo ? "Demo inquiry saved. No owner has been contacted." : "Inquiry sent. You can follow it in your inbox."); }
    catch (e) { notify(e instanceof Error ? e.message : "Please try again.", true); } finally { setBusy(false); }
  }
  async function report(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { await api("/api/reports", { listingId: home.id, reason }); setReporting(false); notify("Report received. It is now in the review queue."); await onRefresh(); }
    catch (e) { notify(e instanceof Error ? e.message : "Please try again.", true); } finally { setBusy(false); }
  }
  async function share() {
    const url = new URL(window.location.href); url.search = ""; url.searchParams.set("home", home.id);
    try { await navigator.clipboard.writeText(url.toString()); notify("Property link copied."); } catch { setShareLink(url.toString()); }
  }
  const date = new Date(home.availableFrom).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
  const own = session?.userId === home.ownerId;
  const unavailable = !home.isDemo && !isListingVisible(home, now);
  const confirmation = getAvailability(home.confirmedAt, now);
  return <Modal title="Rental details" onClose={onClose} wide className="detail-modal">
    <div className="detail-gallery"><img src={home.photos[photo]} alt={`${home.title}, photo ${photo + 1}`} />
      <div className="gallery-label"><span>{home.type}</span>{home.isDemo && <span>Example home</span>}</div>
      <div className="gallery-tools"><button className="round-button" onClick={share} aria-label="Share property"><Share2 size={18} /></button><button className={`round-button ${saved ? "saved" : ""}`} onClick={onSave} aria-label={saved ? "Unsave home" : "Save home"}><Heart size={18} fill={saved ? "currentColor" : "none"} /></button></div>
      {home.photos.length > 1 && <><button className="gallery-arrow left" aria-label="Previous property photo" onClick={() => setPhoto(p => (p + home.photos.length - 1) % home.photos.length)}><ChevronLeft /></button><button className="gallery-arrow right" aria-label="Next property photo" onClick={() => setPhoto(p => (p + 1) % home.photos.length)}><ChevronRight /></button></>}
      <span className="photo-count">{photo + 1} / {home.photos.length} photos</span>
    </div>
    {home.isDemo && <div className="demo-detail">Example home · Photos, location, prices, and owner details are fictional. This property is not offered for rent.</div>}
    <div className="detail-layout"><article className="detail-main">
      <div className="eyebrow">{home.city.toUpperCase()} · {home.type.toUpperCase()}</div><h1>{home.title}</h1><p className="detail-address"><MapPin size={16} />{home.address}{!home.exactLocation && <span>Approximate location</span>}</p>
      <div className="detail-availability"><AvailabilityNote home={home} now={now} /><p>{home.isDemo ? "Fictional example date. This rental is not available." : confirmation.confirmed === null ? "Awaiting lister confirmation." : `Reported by the lister on ${availabilityDate(confirmation.confirmed)}.`}</p></div>
      <div className="detail-specs"><span><BedDouble size={20} />{home.bedrooms === 0 ? "Studio" : `${home.bedrooms} bedroom${home.bedrooms > 1 ? "s" : ""}`}</span><span><Bath size={20} />{home.bathrooms} bathroom{home.bathrooms > 1 ? "s" : ""}</span><span><Maximize size={19} />{home.area} m²</span></div>
      <section className="detail-section"><h3>About this rental</h3>{home.description.split("\n\n").map((p, i) => <p key={i}>{p}</p>)}</section>
      <section className="detail-section"><h3>Amenities</h3><div className="detail-amenities">{home.amenities.length ? home.amenities.map(a => <span key={a}><Check size={17} />{a}</span>) : <p>Ask the lister about amenities.</p>}</div></section>
      <section className="detail-section"><h3>Lease terms</h3><div className="terms-grid"><span><CalendarDays size={18} />Available from<strong>{date}</strong></span><span><CalendarDays size={18} />Minimum lease<strong>{home.minLease} months</strong></span></div><p className="utility-note">{home.utilities}</p><a className="text-link" href={`https://www.google.com/maps/dir/?api=1&destination=${home.lat},${home.lng}`} target="_blank" rel="noreferrer"><Navigation size={15} />{home.exactLocation ? "Open directions" : "Explore the neighborhood on Google Maps"}<ArrowRight size={14} /></a></section>
      <div className="detail-lister"><span className="lister-avatar"><UserRound size={24} /></span><div><strong>{home.ownerName}</strong><span>{home.role}{home.isDemo ? " · Sample profile" : " · Registered lister"}</span></div></div>
      <button className="report-link" onClick={() => { if (!session) onSignIn(); else setReporting(r => !r); }}><Flag size={14} />Report this listing</button>
      {reporting && <form className="report-form" onSubmit={report}><label className="field"><span>What should we check?</span><textarea required minLength={10} maxLength={1000} rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Tell us about the incorrect or misleading information." /></label><button className="button secondary" disabled={busy}>Submit report</button></form>}
      {shareLink && <label className="field share-field"><span>Copy this property link</span><input readOnly value={shareLink} onFocus={e => e.target.select()} /></label>}
    </article><aside className="inquiry-card"><div className="detail-price"><strong>{money(home.price)}</strong><span> / month</span></div><p className="price-basis">{home.priceBasis} · {home.type.toLowerCase()}</p>
      <div className="price-breakdown"><div><span>Monthly rent</span><span>{money(home.price)}</span></div><div><span>Mandatory monthly fees</span><span>{money(home.monthlyFees)}</span></div><div className="price-total"><strong>Monthly total</strong><strong>{money(home.price + home.monthlyFees)}</strong></div></div>
      <div className="upfront"><span>Security deposit<strong>{money(home.deposit)}</strong></span><span>Advance rent<strong>{money(home.advance)}</strong></span><span>Deposit + advance<strong>{money(home.deposit + home.advance)}</strong></span></div><p className="cost-disclaimer">Utilities and other agreed charges may be additional. Confirm all terms with the lister.</p>
      {own ? <button className="button primary full-width" onClick={onManage}>Manage your listing<ArrowRight size={16} /></button> : unavailable ? <div className="detail-unavailable" role="status"><strong>Availability needs confirmation</strong><p>This rental is currently hidden from search. New inquiries are unavailable until the lister confirms it.</p></div> : sent ? <div className="inquiry-sent"><Check size={24} /><strong>{home.isDemo ? "Demo inquiry saved" : "Your inquiry is on its way"}</strong><span>Find this conversation in your inbox.</span></div> : inquire ? <form onSubmit={send} className="inquiry-form"><h4>{home.isDemo ? "Try a sample inquiry" : "Say hello to the lister"}</h4><div className="form-grid"><label className="field"><span>Move-in date</span><input required name="moveIn" type="date" min={today()} defaultValue={home.availableFrom > today() ? home.availableFrom : today()} /></label><label className="field"><span>People moving in</span><input required name="occupants" type="number" min={1} max={20} defaultValue={1} /></label></div><label className="field"><span>Your message</span><textarea required minLength={10} maxLength={2000} rows={4} name="message" defaultValue="Hi! I'm interested in your place. Is it still available, and could we arrange a viewing?" /></label><p className="form-help">{home.isDemo ? "This saves a demo inquiry. No owner will be contacted." : "Your account name and email will be shared with this lister for your inquiry."}</p><button disabled={busy} className="button primary full-width">{busy ? "Sending…" : home.isDemo ? "Save demo inquiry" : "Send inquiry"}<ArrowRight size={16} /></button></form> : <button className="button primary full-width" onClick={() => { if (!session) onSignIn(); else setInquire(true); }}><MessageCircle size={17} />{home.isDemo ? "Try an inquiry" : "Contact the lister"}<ArrowRight size={16} /></button>}
      <div className="inquiry-footnote"><Check size={14} />Free to inquire. No payment required.</div>
    </aside></div>
  </Modal>;
}
