"use client";
import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ImagePlus, LoaderCircle, MapPin, ShieldCheck, X } from "lucide-react";
import { AMENITIES, CITIES, PROPERTY_TYPES, money, type Listing } from "../lib/types";
import { listingInput } from "../lib/validation";
import { api, today } from "../lib/client";
import { Modal } from "./ui";
import RentalMap from "./rental-map";

type Draft = { title: string; type: string; price: number; priceBasis: string; bedrooms: number; bathrooms: number; area: number; city: string; neighborhood: string; address: string; lat: number; lng: number; exactLocation: boolean; description: string; photos: string[]; amenities: string[]; deposit: number; advance: number; monthlyFees: number; utilities: string; minLease: number; availableFrom: string; role: string; authorityConfirmed: boolean };
const fresh: Draft = { title: "", type: "Apartment", price: 0, priceBasis: "entire unit", bedrooms: 1, bathrooms: 1, area: 0, city: "Makati", neighborhood: "", address: "", lat: 0, lng: 0, exactLocation: false, description: "", photos: [], amenities: [], deposit: 0, advance: 0, monthlyFees: 0, utilities: "Electricity and water billed separately.", minLease: 6, availableFrom: "", role: "Direct owner", authorityConfirmed: false };
const steps = ["The basics", "Location", "Photos & details", "Costs & terms"];

export default function ListingForm({ edit, onClose, onSubmitted }: { edit?: Listing; onClose: () => void; onSubmitted: () => Promise<void> }) {
  const [draft, setDraft] = useState<Draft>(edit ? { ...edit, authorityConfirmed: false } : { ...fresh, availableFrom: today() });
  const [step, setStep] = useState(0), [error, setError] = useState(""), [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const update = (key: keyof Draft, value: unknown) => setDraft(p => ({ ...p, [key]: value }));
  const field = (key: keyof Draft, label: string, type = "text", min?: number) => <label className="field"><span>{label}</span><input name={key} aria-label={label} type={type} min={min} max={type === "number" ? 3000000 : undefined} step={type === "number" ? "any" : undefined} required value={draft[key] as string | number} onChange={e => update(key, type === "number" ? Number(e.target.value) : e.target.value)} /></label>;
  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget, files = Array.from(input.files || []);
    if (files.length + draft.photos.length > 6) { setError("Add up to 6 photos."); return; }
    setUploading(true); setError("");
    try { for (const file of files) { if (file.size > 5 * 1024 * 1024) throw new Error("Each photo must be smaller than 5 MB."); const body = new FormData(); body.set("file", file); const result = await api<{ url: string }>("/api/media", body); setDraft(p => ({ ...p, photos: [...p.photos, result.url] })); } }
    catch (e) { setError(e instanceof Error ? e.message : "Photo upload failed."); }
    finally { setUploading(false); input.value = ""; }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (step === 1 && (!draft.lat || !draft.lng)) { setError("Place your pin on the map or enter its coordinates."); return; }
    if (step === 2 && !draft.photos.length) { setError("Upload at least one current photo of your property."); return; }
    if (step < 3) { setStep(s => s + 1); form.current?.closest(".modal")?.scrollTo({ top: 0, behavior: "smooth" }); return; }
    const result = listingInput.safeParse(draft);
    if (!result.success) { const issue = result.error.issues[0]; setError(`${issue.path.join(" ")}: ${issue.message}`); return; }
    setBusy(true);
    try { if (edit) await api(`/api/listings/${edit.id}`, { action: "update", data: result.data }, "PATCH"); else await api("/api/listings", result.data); await onSubmitted(); }
    catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  }
  function close() { if (busy || uploading) return; if (!draft.title || window.confirm("Leave this listing without submitting it?")) onClose(); }
  const city = CITIES.find(c => c.name === draft.city) || CITIES[0];
  return <Modal title={edit ? "Edit your listing" : "Create a rental listing"} onClose={close} wide className="listing-modal">
    <div className="listing-form-layout"><aside className="form-sidebar"><p className="eyebrow">LIST YOUR PLACE</p><h3>Put your rental<br />on the map.</h3><p>Add the location, photos, price, and lease terms.</p><ol className="form-steps">{steps.map((s, i) => <li className={step === i ? "current" : step > i ? "complete" : ""} key={s}><span>{step > i ? <Check size={14} /> : i + 1}</span>{s}</li>)}</ol><div className="free-note"><ShieldCheck size={21} /><div><strong>Your basic listing is free.</strong><p>New and edited listings are reviewed before appearing in search.</p></div></div></aside>
    <form ref={form} onSubmit={submit} className="listing-form"><div className="form-section-header"><span>STEP {step + 1} OF 4</span><h3>{steps[step]}</h3><p>{["Add your property type, size, and amenities.", "Set the address and place the pin on the map.", "Upload clear photos of the rental.", "Set the rent, move-in costs, and lease terms."][step]}</p></div>
      {step === 0 && <div className="form-grid">
        <label className="field full"><span>Listing title</span><input required minLength={8} maxLength={100} placeholder="e.g. Bright 1-bedroom apartment near work" value={draft.title} onChange={e => update("title", e.target.value)} /></label>
        <label className="field"><span>Property type</span><select value={draft.type} onChange={e => { update("type", e.target.value); update("priceBasis", e.target.value === "Bedspace" ? "per person" : e.target.value === "Room" ? "per room" : "entire unit"); }}>{PROPERTY_TYPES.slice(1).map(t => <option key={t}>{t}</option>)}</select></label>
        <label className="field"><span>Your role</span><select value={draft.role} onChange={e => update("role", e.target.value)}><option>Direct owner</option><option>Authorized manager</option><option>Licensed broker</option></select></label>
        {field("price", "Monthly rent (₱)", "number", 100)}
        <label className="field"><span>Price is for</span><select value={draft.priceBasis} onChange={e => update("priceBasis", e.target.value)}><option value="entire unit">The entire unit</option><option value="per room">One room</option><option value="per person">One person / bedspace</option></select></label>
        {field("bedrooms", "Bedrooms (0 for studio)", "number", 0)}{field("bathrooms", "Bathrooms", "number", 0)}{field("area", "Floor area (m²)", "number", 1)}
      </div>}
      {step === 1 && <div className="form-grid">
        <label className="field"><span>City or municipality</span><input list="philippine-cities" required minLength={2} value={draft.city} onChange={e => update("city", e.target.value)} /><datalist id="philippine-cities">{CITIES.map(c => <option key={c.name} value={c.name} />)}</datalist></label>
        {field("neighborhood", "Barangay / neighborhood")}
        <label className="field full"><span>Property address</span><input required minLength={8} placeholder="Building, street, barangay" value={draft.address} onChange={e => update("address", e.target.value)} /></label>
        <div className="full form-map"><RentalMap compact center={[city.lat, city.lng]} zoom={city.zoom} pickValue={draft.lat && draft.lng ? [draft.lat, draft.lng] : null} onPick={p => setDraft(d => ({ ...d, lat: p[0], lng: p[1] }))} /></div>
        {field("lat", "Latitude", "number", 4.5)}{field("lng", "Longitude", "number", 116)}
        <label className="check-row full"><input type="checkbox" checked={draft.exactLocation} onChange={e => update("exactLocation", e.target.checked)} /><span>Show the exact location publicly<small>When unchecked, renters see an approximate pin and neighborhood.</small></span></label>
      </div>}
      {step === 2 && <div className="form-grid">
        <div className="field full"><span>Property photos · {draft.photos.length}/6</span><div className="upload-grid">{draft.photos.map((photo, i) => <div className="upload-photo" key={photo}><img src={photo} alt={`Property photo ${i + 1}`} /><button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => update("photos", draft.photos.filter(p => p !== photo))}><X size={14} /></button></div>)}{draft.photos.length < 6 && <label className="upload-target">{uploading ? <LoaderCircle className="spin" /> : <ImagePlus />}<span>{uploading ? "Uploading…" : "Add photos"}</span><input aria-label="Upload property photos" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploading} onChange={upload} /></label>}</div><small>Use your own current photos. JPEG, PNG, or WebP, up to 5 MB each.</small></div>
        <label className="field full"><span>About your place</span><textarea required minLength={30} maxLength={5000} rows={5} placeholder="Describe the space, nearby essentials, house rules, and what renters should know." value={draft.description} onChange={e => update("description", e.target.value)} /></label>
        <div className="field full"><span>What does your place offer?</span><div className="amenity-options">{AMENITIES.map(a => <button className={draft.amenities.includes(a) ? "selected" : ""} type="button" key={a} onClick={() => update("amenities", draft.amenities.includes(a) ? draft.amenities.filter(v => v !== a) : [...draft.amenities, a])}>{draft.amenities.includes(a) && <Check size={13} />}{a}</button>)}</div></div>
      </div>}
      {step === 3 && <div className="form-grid">
        {field("deposit", "Security deposit (₱)", "number", 0)}{field("advance", "Advance rent (₱)", "number", 0)}{field("monthlyFees", "Other mandatory monthly fees (₱)", "number", 0)}{field("minLease", "Minimum lease (months)", "number", 1)}
        <label className="field full"><span>Available from</span><input required type="date" value={draft.availableFrom} onChange={e => update("availableFrom", e.target.value)} /></label>
        <label className="field full"><span>Utilities and other costs</span><textarea required minLength={5} rows={3} value={draft.utilities} onChange={e => update("utilities", e.target.value)} /></label>
        <div className="cost-summary full"><span>Known deposit + advance</span><strong>{money(draft.deposit + draft.advance)}</strong><small>Renters will see your monthly fees and utility notes separately.</small></div>
        <label className="check-row full"><input required type="checkbox" checked={draft.authorityConfirmed} onChange={e => update("authorityConfirmed", e.target.checked)} /><span>I am authorized to list this property, have permission to use its photos, and confirm these details are accurate.</span></label>
      </div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">{step > 0 ? <button className="button secondary" type="button" onClick={() => { setError(""); setStep(s => s - 1); }} disabled={busy}><ArrowLeft size={16} />Back</button> : <span />}
        <button className="button primary" type="submit" disabled={busy || uploading}>{busy ? <LoaderCircle size={17} className="spin" /> : null}{step === 3 ? (busy ? "Submitting…" : "Submit for review") : "Continue"}{step < 3 && <ArrowRight size={16} />}</button></div>
    </form></div>
  </Modal>;
}
