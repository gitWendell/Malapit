"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownUp, ArrowRight, Bath, Bell, BedDouble, Building2, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Compass, DoorOpen, Heart, House, Info, LayoutGrid, LoaderCircle, LogOut, Map, MapPin, Maximize, MessageCircle, Pencil, Plus, RefreshCw, Search, ShieldCheck, SlidersHorizontal, UserRound, X } from "lucide-react";
import { AMENITIES, CITIES, PROPERTY_TYPES, money, type AppData, type Listing } from "../lib/types";
import { DEMO_LISTINGS } from "../lib/demo";
import { api } from "../lib/client";
import RentalMap, { type MapBounds } from "./rental-map";
import HomeDetail from "./home-detail";
import AvailabilityNote from "./availability-note";
import OwnerAvailability from "./owner-availability";
import InstallApp from "./install-app";
import { isListingVisible, needsAvailabilityReminder } from "../lib/availability";
import ListingForm from "./listing-form";
import { Empty, Logo, Modal, SignIn } from "./ui";
import { PILOT_LIMITS } from "../lib/pilot-limits";

const EMPTY_DATA: AppData = { session: null, listings: [], myListings: [], reviewListings: [], savedIds: [], inquiries: [], reports: [] };
type Nav = "explore" | "saved" | "listings" | "inbox" | "review";
type Filters = { type: string; maxPrice: number; beds: number; amenities: string[]; moveIn: string };
const DEFAULT_FILTERS: Filters = { type: "All homes", maxPrice: 1000000, beds: -1, amenities: [], moveIn: "" };
const typeIcons = [LayoutGrid, Building2, Building2, House, DoorOpen, BedDouble];
const metroCities = ["Makati", "Taguig", "Quezon City", "Manila", "Pasig", "Mandaluyong", "Pasay", "Parañaque", "Las Piñas", "Muntinlupa", "San Juan", "Marikina", "Caloocan", "Valenzuela", "Malabon", "Navotas"];
const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const statusLabel = (s: string) => ({ pending: "In review", published: "Published", paused: "Paused", rented: "Rented", changes_requested: "Needs changes", withdrawn: "Withdrawn" }[s] || s);

export default function RentalApp() {
  const [data, setData] = useState<AppData>(EMPTY_DATA), [loaded, setLoaded] = useState(false), [loadError, setLoadError] = useState("");
  const [nav, setNav] = useState<Nav>("explore"), [query, setQuery] = useState("Metro Manila"), [searchText, setSearchText] = useState("Metro Manila");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS), [sort, setSort] = useState("recommended"), [showDemo, setShowDemo] = useState(true);
  const [center, setCenter] = useState<[number, number]>([14.565, 121.035]), [zoom, setZoom] = useState(13);
  const [bounds, setBounds] = useState<MapBounds | null>(null), latestBounds = useRef<MapBounds | null>(null);
  const [hovered, setHovered] = useState(""), [detail, setDetail] = useState<Listing | null>(null), [panel, setPanel] = useState<"filters" | "about" | "signin" | null>(null);
  const [selectedHomeId, setSelectedHomeId] = useState(""), [mapFocusRequest, setMapFocusRequest] = useState(0), [mapViewRequest, setMapViewRequest] = useState(0);
  const mapPanel = useRef<HTMLElement | null>(null);
  const [editing, setEditing] = useState<Listing | null>(null), [listingForm, setListingForm] = useState(false), [accountMenu, setAccountMenu] = useState(false);
  const [suggestions, setSuggestions] = useState(false), [mobileMap, setMobileMap] = useState(false), [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const refreshRequest = useRef(0);
  const notify = useCallback((message: string, error = false) => setToast({ message, error }), []);
  const refresh = useCallback(async () => {
    const request = ++refreshRequest.current;
    const result = await api<AppData>("/api/data", undefined, "GET");
    if (request === refreshRequest.current) { setData(result); setNow(Date.now()); setLoadError(""); }
    return result;
  }, []);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const resume = () => { tick(); if (document.visibilityState === "visible") void refresh().catch(() => {}); };
    const timer = setInterval(tick, 60_000);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => { clearInterval(timer); window.removeEventListener("focus", resume); document.removeEventListener("visibilitychange", resume); };
  }, [refresh]);
  useEffect(() => {
    refresh().then(result => {
      const params = new URLSearchParams(window.location.search), id = params.get("home"), requestedNav = params.get("view");
      if (params.get("auth") === "failed") { notify("We couldn't finish signing you in. Please try again.", true); params.delete("auth"); window.history.replaceState(null, "", window.location.pathname + (params.size ? `?${params}` : "")); }
      if (id) { const home = [...result.listings, ...result.myListings, ...DEMO_LISTINGS].find(p => p.id === id); if (home) setDetail(home); }
      if (result.session && params.get("new") === "1") setListingForm(true);
      if (result.session && ["saved", "listings", "inbox", "review"].includes(requestedNav || "")) setNav(requestedNav as Nav);
      if (result.session && requestedNav === "saved") { setQuery(""); setSearchText(""); setCenter([12.4, 122]); setZoom(6); }
    }).catch(e => setLoadError(e.message)).finally(() => setLoaded(true));
  }, [refresh]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 5000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { if (!accountMenu) return; const close = () => setAccountMenu(false); document.addEventListener("click", close); return () => document.removeEventListener("click", close); }, [accountMenu]);
  const homes = useMemo(() => [...data.listings.filter(home => isListingVisible(home, now)), ...(showDemo ? DEMO_LISTINGS : [])], [data.listings, showDemo, now]);
  const reminders = useMemo(() => data.myListings.filter(home => needsAvailabilityReminder(home, now)).sort((a, b) => (Date.parse(a.confirmedAt) || 0) - (Date.parse(b.confirmedAt) || 0)), [data.myListings, now]);
  const managedHomes = useMemo(() => [...reminders, ...data.myListings.filter(home => !reminders.some(reminder => reminder.id === home.id))], [data.myListings, reminders]);
  const currentDetail = detail ? data.myListings.find(home => home.id === detail.id) || data.listings.find(home => home.id === detail.id) || detail : null;
  const matches = useMemo(() => {
    let items = homes.filter(p => {
      const term = normalize(query.trim()), haystack = normalize(`${p.title} ${p.city} ${p.neighborhood} ${p.address} ${p.description}`);
      const areaMatch = !term || term === "philippines" || (term === "metro manila" ? metroCities.includes(p.city) : haystack.includes(term));
      return areaMatch && (nav !== "saved" || data.savedIds.includes(p.id)) && (filters.type === "All homes" || p.type === filters.type) && p.price <= filters.maxPrice && (filters.beds < 0 || (filters.beds === 0 ? p.bedrooms === 0 : p.bedrooms >= filters.beds)) && filters.amenities.every(a => p.amenities.includes(a)) && (!filters.moveIn || p.availableFrom <= filters.moveIn) && (!bounds || (p.lat >= bounds.south && p.lat <= bounds.north && p.lng >= bounds.west && p.lng <= bounds.east));
    });
    if (sort === "low") items = [...items].sort((a, b) => a.price - b.price);
    if (sort === "high") items = [...items].sort((a, b) => b.price - a.price);
    if (sort === "new") items = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return items;
  }, [homes, query, filters, nav, data.savedIds, sort, bounds]);
  useEffect(() => {
    setSelectedHomeId(id => matches.some(home => home.id === id) ? id : "");
    setHovered(id => matches.some(home => home.id === id) ? id : "");
  }, [matches]);
  const selectedHome = matches.find(home => home.id === selectedHomeId);
  const filterCount = (filters.type !== "All homes" ? 1 : 0) + (filters.maxPrice < 1000000 ? 1 : 0) + (filters.beds >= 0 ? 1 : 0) + filters.amenities.length + (filters.moveIn ? 1 : 0);
  function openHome(home: Listing) { if (matches.some(p => p.id === home.id)) setSelectedHomeId(home.id); setDetail(home); const url = new URL(window.location.href); url.searchParams.set("home", home.id); window.history.replaceState(null, "", url); }
  function focusHome(home: Listing) {
    setSelectedHomeId(home.id); setHovered(""); setMapFocusRequest(n => n + 1); setMobileMap(true);
    if (window.matchMedia("(max-width: 760px)").matches) requestAnimationFrame(() => mapPanel.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest",
    }));
  }
  function closeHome() { setDetail(null); const url = new URL(window.location.href); url.searchParams.delete("home"); window.history.replaceState(null, "", url); }
  function go(next: Nav) {
    if (next !== "explore" && !data.session) { setPanel("signin"); return; }
    setNav(next); setMobileMap(false); setAccountMenu(false); setSelectedHomeId(""); setHovered(""); closeHome();
    const url = new URL(window.location.href); if (next === "explore") url.searchParams.delete("view"); else url.searchParams.set("view", next); url.searchParams.delete("new"); window.history.replaceState(null, "", url);
    if (next === "saved") { setQuery(""); setSearchText(""); setBounds(null); setFilters(DEFAULT_FILTERS); setCenter([12.4, 122]); setZoom(6); }
  }
  function search(value = searchText) {
    setQuery(value); setSearchText(value); setBounds(null); setSuggestions(false); setSelectedHomeId(""); setHovered(""); setMapViewRequest(n => n + 1);
    const city = CITIES.find(c => normalize(c.name) === normalize(value));
    if (city) { setCenter([city.lat, city.lng]); setZoom(city.zoom); }
    else if (!value || normalize(value) === "philippines") { setCenter([12.4, 122]); setZoom(6); }
    else { const home = homes.find(p => normalize(`${p.title} ${p.city} ${p.neighborhood} ${p.address}`).includes(normalize(value))); if (home) { setCenter([home.lat, home.lng]); setZoom(14); } }
  }
  async function save(home: Listing) {
    if (!data.session) { setPanel("signin"); return; }
    if (busy) return;
    setBusy(true); const saved = !data.savedIds.includes(home.id);
    try { await api("/api/saved", { listingId: home.id, saved }); await refresh(); notify(saved ? "Rental saved." : "Rental removed from saved homes."); }
    catch (e) { notify(e instanceof Error ? e.message : "Please try again.", true); } finally { setBusy(false); }
  }
  async function listingAction(home: Listing, action: string, reason?: string) {
    if (busy) return; setBusy(true);
    try { await api(`/api/listings/${home.id}`, { action, reason }, "PATCH"); await refresh(); notify(({ approve: "Listing approved and published.", reject: "Changes requested from the lister.", confirm: "Confirmed available. This rental is visible in search for another 14 days.", pause: "Listing paused.", rent: "Marked as rented. Removed from search.", resubmit: "Listing submitted for review." } as Record<string, string>)[action]); }
    catch (e) { notify(e instanceof Error ? e.message : "Please try again.", true); } finally { setBusy(false); }
  }
  function createListing() { setAccountMenu(false); if (!data.session) { setPanel("signin"); return; } setEditing(null); setListingForm(true); }
  const browse = nav === "explore" || nav === "saved";
  return <div className={`app-shell ${browse ? "browse-shell" : "workspace-shell"} ${browse && mobileMap ? "is-mobile-map" : ""}`}>
    <header className="site-header"><button className="brand-link" aria-label="Malapit home" onClick={() => go("explore")}><Logo /></button><nav className="main-nav" aria-label="Main navigation"><button className={nav === "explore" ? "active" : ""} onClick={() => go("explore")}>Explore rentals</button><button className={nav === "saved" ? "active" : ""} onClick={() => go("saved")}>Saved homes{data.savedIds.length > 0 && <span className="nav-count">{data.savedIds.length}</span>}</button><button className={nav === "inbox" ? "active" : ""} onClick={() => go("inbox")}>Inquiries{data.inquiries.length > 0 && <span className="nav-count">{data.inquiries.length}</span>}</button></nav>
      <div className="header-actions"><InstallApp /><button className="list-place-button" aria-label="List your place" onClick={createListing}><Plus size={17} /><span>List your place</span></button><div className="account-container"><button className="account-button" aria-label="Open account menu" aria-expanded={accountMenu} onClick={e => { e.stopPropagation(); if (data.session) setAccountMenu(p => !p); else setPanel("signin"); }}>{data.session ? <span>{data.session.displayName.slice(0, 1).toUpperCase()}</span> : <UserRound size={18} />}<ChevronDown size={12} /></button>{accountMenu && <div className="account-menu" onClick={e => e.stopPropagation()}><div className="account-identity"><strong>{data.session?.displayName}</strong><span>{data.session?.email}</span></div><button onClick={() => go("explore")}><Search size={16} />Explore rentals</button><button onClick={() => go("saved")}><Heart size={16} />Saved homes</button><button onClick={() => go("listings")}><House size={16} />My listings{reminders.length > 0 && <span className="nav-count">{reminders.length} to confirm</span>}</button><button onClick={() => go("inbox")}><MessageCircle size={16} />My inquiries</button>{data.session?.isAdmin && <button onClick={() => go("review")}><ShieldCheck size={16} />Review listings</button>}<button onClick={() => { setPanel("about"); setAccountMenu(false); }}><CircleHelp size={16} />How Malapit works</button><a href="/auth/signout?return_to=/" target="_top"><LogOut size={16} />Sign out</a></div>}</div></div>
    </header>
    {loaded && data.session && reminders.length > 0 && nav !== "listings" && <aside className="availability-reminder-banner" aria-label="Availability reminder">
      <Bell size={17} /><span><strong>{reminders.length} {reminders.length === 1 ? "rental needs" : "rentals need"} an availability check.</strong> Confirm what is still available.</span><button onClick={() => go("listings")}>Review listings<ArrowRight size={14} /></button>
    </aside>}
    {loadError && <div className="load-error" role="alert">We couldn't load your account or published listings.<button onClick={() => refresh().catch(e => setLoadError(e.message))}>Try again</button></div>}
    {browse ? <>
      <section className="intro"><div><p className="eyebrow"><span className="welcome-dot" />Welcome to Malapit</p><h1>{nav === "saved" ? "Your saved rentals" : "Let’s find your next home."}</h1><p className="intro-description">{nav === "saved" ? "Compare the places you have saved." : "Browse the map, compare rents, and find your kind of place."}</p></div><div className="intro-aside"><span className="country-pill"><MapPin size={16} />Philippines</span><span>Search by city or neighborhood.</span></div></section>
      <div className="search-toolbar"><form className="search-bar" onSubmit={e => { e.preventDefault(); search(); }}><MapPin size={21} className="search-pin" /><div className="location-input"><label htmlFor="location-search">Where do you want to live?</label><input id="location-search" autoComplete="off" value={searchText} placeholder="City, neighborhood, or landmark" onChange={e => { setSearchText(e.target.value); setSuggestions(true); }} onFocus={() => setSuggestions(true)} onBlur={() => setTimeout(() => setSuggestions(false), 180)} />{suggestions && <div className="search-suggestions"><span>{searchText ? "EXPLORE A LOCATION" : "POPULAR PLACES"}</span>{CITIES.filter(c => !searchText || c.name.toLowerCase().includes(searchText.toLowerCase())).slice(0, 6).map(c => <button type="button" key={c.name} onMouseDown={e => e.preventDefault()} onClick={() => search(c.name)}><MapPin size={16} /><span>{c.name}<small>Philippines</small></span><ArrowRight size={14} /></button>)}<button type="button" onMouseDown={e => e.preventDefault()} onClick={() => search("")}><Map size={16} /><span>Anywhere in the Philippines</span><ArrowRight size={14} /></button></div>}</div>
        <div className="budget-input"><label htmlFor="budget">Monthly budget</label><select id="budget" value={filters.maxPrice} onChange={e => setFilters(f => ({ ...f, maxPrice: Number(e.target.value) }))}><option value={1000000}>Any budget</option><option value={8000}>Up to ₱8,000</option><option value={15000}>Up to ₱15,000</option><option value={25000}>Up to ₱25,000</option><option value={40000}>Up to ₱40,000</option></select></div><button className="search-submit" type="submit" aria-label="Search rentals"><Search size={19} /><span>Search</span></button></form><button className={`filter-button ${filterCount ? "has-filters" : ""}`} onClick={() => setPanel("filters")}><SlidersHorizontal size={18} />Filters{filterCount > 0 && <span>{filterCount}</span>}</button></div>
      <div className="category-toolbar"><div className="category-tabs" role="group" aria-label="Property type">{PROPERTY_TYPES.map((type, i) => { const Icon = typeIcons[i]; return <button key={type} className={filters.type === type ? "selected" : ""} aria-pressed={filters.type === type} onClick={() => setFilters(f => ({ ...f, type }))}><Icon size={17} />{type === "All homes" ? type : type === "House" ? "Houses" : type === "Bedspace" ? "Bedspaces" : `${type}s`}</button>; })}</div><button className="how-it-works" onClick={() => setPanel("about")}><CircleHelp size={15} />How it works<ArrowRight size={14} /></button></div>
      <main className={`explore-layout ${mobileMap ? "mobile-map-active" : ""}`}><section className="results-pane"><div className="results-heading"><div><h2>{nav === "saved" ? "Saved rentals" : bounds ? "Rentals in this area" : query || "Rentals in the Philippines"}</h2><p><strong>{matches.length} {matches.length === 1 ? "rental" : "rentals"}</strong> {bounds ? "in this map area" : query ? "in this location" : "across the Philippines"}</p></div><label className="sort-select"><ArrowDownUp size={14} /><select aria-label="Sort properties" value={sort} onChange={e => setSort(e.target.value)}><option value="recommended">Recommended</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option><option value="new">Newest first</option></select></label></div>
        <div className="collection-note"><Info size={14} /><span>{showDemo ? "Preview includes fictional example homes." : "Showing published owner listings only."}</span><button onClick={() => setShowDemo(v => !v)}>{showDemo ? "Hide examples" : "Show examples"}</button></div>
        {(bounds || filterCount > 0) && <div className="active-filters">{bounds && <button onClick={() => setBounds(null)}>Map area<X size={12} /></button>}{filterCount > 0 && <button onClick={() => setFilters(DEFAULT_FILTERS)}>Clear {filterCount} filter{filterCount > 1 ? "s" : ""}<X size={12} /></button>}</div>}
        <div className="results-scroll">{matches.length ? <div className="property-grid">{matches.map(home => <PropertyCard key={home.id} home={home} now={now} selected={home.id === selectedHomeId} saved={data.savedIds.includes(home.id)} onSave={() => save(home)} onLocate={() => focusHome(home)} onOpen={() => openHome(home)} onHover={value => setHovered(current => value ? home.id : current === home.id ? "" : current)} />)}</div> : <Empty title={nav === "saved" ? "No saved rentals yet" : "No matching rentals"} description={nav === "saved" ? "Tap the heart on a listing to save it here." : "Try another area, increase your budget, or remove a filter."} action={<button className="button primary" onClick={() => { if (nav === "saved") go("explore"); else { setFilters(DEFAULT_FILTERS); setBounds(null); search(""); } }}>Browse rentals<ArrowRight size={16} /></button>} />}
          <footer className="results-footer"><span>Malapit / Philippines</span><button onClick={() => setPanel("about")}>About Malapit<ArrowRight size={12} /></button></footer>
        </div>
      </section><section ref={mapPanel} className="map-pane" aria-label="Map search"><RentalMap listings={matches} center={center} zoom={zoom} viewRequest={mapViewRequest} selected={selectedHomeId} focusRequest={mapFocusRequest} hovered={hovered} onSelect={focusHome} onBounds={b => { latestBounds.current = b; }} />
        {showDemo && <div className="map-demo-label"><Info size={13} />Includes fictional example homes</div>}
        <button className="search-area-button" onClick={() => { if (latestBounds.current) { setBounds(latestBounds.current); setQuery(""); setSearchText(""); } }}><RefreshCw size={15} />Search this area</button>
        {selectedHome ? <aside className="map-selected-home" aria-label="Selected property" aria-live="polite">
          <img src={selectedHome.photos[0]} alt="" />
          <div><strong>{selectedHome.title}</strong><p>{selectedHome.neighborhood}, {selectedHome.city}</p><AvailabilityNote home={selectedHome} now={now} compact /><span>{money(selectedHome.price)} <small>/ month · {selectedHome.priceBasis}</small></span><button className="text-link" onClick={() => openHome(selectedHome)}>View details<ArrowRight size={13} /></button></div>
          <button className="icon-button" aria-label="Clear selected property" onClick={() => { setSelectedHomeId(""); setHovered(""); }}><X size={16} /></button>
        </aside> : <div className="map-caption"><span><MapPin size={20} /></span><div><strong>Find it on the map.</strong><p>Hover a listing to highlight its price. Select it to zoom in.</p></div></div>}
      </section></main>
    </> : <main className="workspace"><div className="workspace-title"><div><p className="eyebrow">Your account</p><h1>{nav === "listings" ? "My listings" : nav === "review" ? "Listing review" : "Rental inquiries"}</h1><p>{nav === "listings" ? "Update your properties, prices, and availability." : nav === "review" ? "Review submissions, request corrections, and handle reports." : "Read rental inquiries and reply to renters."}</p></div>{nav === "listings" && <button className="button primary" onClick={createListing}><Plus size={17} />List a place</button>}</div>
      {!loaded ? <div className="loading-inline"><LoaderCircle className="spin" />Loading your space…</div> : !data.session ? <Empty title="Make yourself at home" description="Sign in to manage your listings and conversations." action={<button className="button primary" onClick={() => setPanel("signin")}>Sign in</button>} /> : nav === "inbox" ? <Inbox data={data} refresh={async () => { await refresh(); }} notify={notify} /> : nav === "review" ? <Review data={data} busy={busy} action={listingAction} open={openHome} refresh={async () => { await refresh(); }} notify={notify} /> : <>
        <div className="stat-grid"><div><span>Your properties</span><strong>{data.myListings.length}</strong></div><div><span>Visible in search</span><strong>{data.myListings.filter(home => isListingVisible(home, now)).length}</strong></div><div><span>Awaiting review</span><strong>{data.myListings.filter(p => p.status === "pending").length}</strong></div></div>
        <section className={`availability-policy ${reminders.length ? "has-reminders" : ""}`} aria-label="Availability reminders">
          <Bell size={21} /><div><h2>{reminders.length ? `${reminders.length} ${reminders.length === 1 ? "rental needs" : "rentals need"} confirmation` : "Keep your availability up to date"}</h2><p>In-app reminders start after 7 days. Rentals are hidden from search after 14 days without confirmation. Confirm only if the property is still available.</p></div>
        </section>
        {managedHomes.length ? <div className="manage-list">{managedHomes.map(home => <article className="manage-card" key={home.id}>
          <div className="manage-property-row"><button className="manage-photo" onClick={() => openHome(home)}><img src={home.photos[0]} alt={home.title} /></button>
            <div className="manage-info"><span className={`status status-${home.status === "published" && !isListingVisible(home, now) ? "hidden" : home.status}`}>{home.status === "published" && !isListingVisible(home, now) ? "Hidden · confirmation overdue" : statusLabel(home.status)}</span><h3>{home.title}</h3><p><MapPin size={14} />{home.neighborhood}, {home.city}</p><strong>{money(home.price)} <small>/ month</small></strong>{home.reviewNote && <p className="review-note">Reviewer: {home.reviewNote}</p>}<AvailabilityNote home={home} now={now} /></div>
            <div className="manage-actions"><button className="button secondary" onClick={() => { setEditing(home); setListingForm(true); }}><Pencil size={14} />Edit details</button>{!["rented", "withdrawn"].includes(home.status) && <button disabled={busy} onClick={() => listingAction(home, "withdraw")}>Withdraw listing</button>}{["paused", "rented", "changes_requested", "withdrawn"].includes(home.status) && <button disabled={busy} onClick={() => listingAction(home, "resubmit")}><RefreshCw size={14} />Submit for review</button>}</div>
          </div>
          <OwnerAvailability home={home} now={now} busy={busy} onConfirm={() => listingAction(home, "confirm")} onRent={() => listingAction(home, "rent")} onPause={() => listingAction(home, "pause")} />
        </article>)}</div> : <Empty title="Your first tenant starts with a listing" description="Add your property, place it on the map, and give renters the details they need. Your basic listing is free." action={<button className="button primary" onClick={createListing}><Plus size={17} />List your first place</button>} />}

      </>}
    </main>}
    {currentDetail && <HomeDetail home={currentDetail} now={now} session={data.session} saved={data.savedIds.includes(currentDetail.id)} onSave={() => save(currentDetail)} onClose={closeHome} onSignIn={() => setPanel("signin")} onRefresh={async () => { await refresh(); }} notify={notify} onManage={() => go("listings")} />}
    {panel === "signin" && <SignIn ready={data.pilot?.signInReady} local={data.pilot?.signInProvider === "local"} onClose={() => setPanel(null)} />}
    {panel === "filters" && <FilterModal filters={filters} onClose={() => setPanel(null)} onApply={f => { setFilters(f); setPanel(null); }} />}
    {panel === "about" && <Modal title="How Malapit works" onClose={() => setPanel(null)}><div className="about-content"><Logo /><p>Malapit means “near.” Find Philippine rentals by location, compare costs, and contact the lister.</p><div><span>01</span><section><h3>Choose an area.</h3><p>Set your location, budget, and property type. Browse the listings beside the map.</p></section></div><div><span>02</span><section><h3>Check the details.</h3><p>See rental prices, move-in costs, amenities, and the property's location.</p></section></div><div><span>03</span><section><h3>Ask about a viewing.</h3><p>Contact the lister about availability. Owners and renters arrange viewings and rental agreements directly.</p></section></div><p className="about-note">This early version includes clearly labeled fictional homes. Basic listings and inquiries are free. Paid promotions are not active.</p></div></Modal>}
    {listingForm && <ListingForm edit={editing || undefined} pilot={data.pilot} onClose={() => setListingForm(false)} onSubmitted={async () => { await refresh(); setListingForm(false); setEditing(null); go("listings"); notify("Your listing is in the review queue. You can manage it here."); }} />}
    <nav className="mobile-bottom-nav" aria-label="Phone navigation">
      <button className={nav === "explore" && !mobileMap ? "active" : ""} aria-current={nav === "explore" && !mobileMap ? "page" : undefined} onClick={() => { if (nav === "explore") setMobileMap(false); else go("explore"); }}><Compass size={22} /><span>Explore</span></button>
      <button className={browse && mobileMap ? "active" : ""} aria-current={browse && mobileMap ? "page" : undefined} onClick={() => { if (!browse) go("explore"); setMobileMap(true); }}><Map size={22} /><span>Map</span></button>
      <button className={nav === "saved" && !mobileMap ? "active" : ""} aria-current={nav === "saved" && !mobileMap ? "page" : undefined} onClick={() => { if (nav === "saved") setMobileMap(false); else go("saved"); }}><Heart size={22} /><span>Saved</span>{data.savedIds.length > 0 && <small>{data.savedIds.length}</small>}</button>
      <button className={nav === "inbox" ? "active" : ""} aria-current={nav === "inbox" ? "page" : undefined} onClick={() => go("inbox")}><MessageCircle size={22} /><span>Inquiries</span></button>
      <button className={nav === "listings" ? "active" : ""} aria-current={nav === "listings" ? "page" : undefined} onClick={() => go("listings")}><House size={22} /><span>My listings</span>{reminders.length > 0 && <small>{reminders.length}</small>}</button>
    </nav>
    {toast && <div className={`toast ${toast.error ? "toast-error" : ""}`} role="status">{toast.error ? <Info size={18} /> : <CheckCircle2 size={18} />}<span>{toast.message}</span><button aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={15} /></button></div>}
  </div>;
}

function PropertyCard({ home, now, selected, saved, onSave, onLocate, onOpen, onHover }: { home: Listing; now: number; selected: boolean; saved: boolean; onSave: () => void; onLocate: () => void; onOpen: () => void; onHover: (v: boolean) => void }) {
  const [photo, setPhoto] = useState(0);
  return <article className={`property-card ${selected ? "is-selected" : ""}`} data-listing-id={home.id}
    onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}
    onFocusCapture={() => onHover(true)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onHover(false); }}>
    <div className="card-image">
      <button className="image-open" onClick={onLocate} aria-label={`Show ${home.title} on map`} aria-pressed={selected}><img src={home.photos[photo]} alt={home.title} loading="lazy" /></button>
      <span className={`card-badge ${home.isDemo ? "sample-badge" : ""}`}>{home.isDemo ? "Example home" : <><span className="tiny-dot" />{home.role}</>}</span>
      <button className={`save-button ${saved ? "saved" : ""}`} aria-label={`${saved ? "Unsave" : "Save"} ${home.title}`} aria-pressed={saved} onClick={onSave}><Heart size={18} fill={saved ? "currentColor" : "none"} /></button>
      {home.photos.length > 1 && <><button className="card-photo-arrow previous" aria-label={`Previous photo of ${home.title}`} onClick={() => setPhoto(p => (p + home.photos.length - 1) % home.photos.length)}><ChevronLeft size={16} /></button><button className="card-photo-arrow next" aria-label={`Next photo of ${home.title}`} onClick={() => setPhoto(p => (p + 1) % home.photos.length)}><ChevronRight size={16} /></button><span className="card-photo-count">{photo + 1} / {home.photos.length}</span></>}
    </div>
    <button className="card-info" onClick={onLocate} aria-label={`Locate ${home.title} on the map`} aria-pressed={selected}>
      <div className="card-price"><strong>{money(home.price)}</strong><span>/ month</span><small>{home.priceBasis}</small></div>
      <div className="card-title-row"><span className="card-type">{home.type}</span><span className="card-open-icon"><MapPin size={15} /></span></div>
      <h3>{home.title}</h3><p className="card-location"><MapPin size={13} />{home.neighborhood}, {home.city}</p>
      <div className="card-specs"><span><BedDouble size={15} />{home.bedrooms === 0 ? "Studio" : `${home.bedrooms} bed`}</span><span><Bath size={15} />{home.bathrooms} bath</span><span><Maximize size={13} />{home.area} m²</span></div>
      <AvailabilityNote home={home} now={now} />
      <div className="card-features">{home.amenities.filter(a => ["Furnished", "Pet friendly", "Parking", "Wi-Fi"].includes(a)).slice(0, 2).map(a => <span key={a}>{a}</span>)}</div>
    </button>
    <div className="card-actions"><button className="card-map-link" onClick={onLocate} aria-label={`Center map on ${home.title}`} aria-pressed={selected}><MapPin size={12} />{selected ? "Selected on map" : "Show on map"}</button><button className="card-details-link" onClick={onOpen} aria-label={`View details for ${home.title}`}>View details<ArrowRight size={13} /></button></div>
  </article>;
}

function FilterModal({ filters, onApply, onClose }: { filters: Filters; onApply: (f: Filters) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(filters);
  return <Modal title="Filter rentals" onClose={onClose}><div className="filter-content"><section><h3>Monthly budget</h3><p>Rental prices in Philippine pesos.</p><label className="field"><span>Maximum monthly rent</span><select value={draft.maxPrice} onChange={e => setDraft(p => ({ ...p, maxPrice: Number(e.target.value) }))}><option value={1000000}>Any budget</option>{[5000, 8000, 10000, 15000, 20000, 25000, 40000, 60000].map(n => <option key={n} value={n}>Up to {money(n)}</option>)}</select></label></section><section><h3>Kind of home</h3><div className="amenity-options">{PROPERTY_TYPES.map(t => <button key={t} className={draft.type === t ? "selected" : ""} onClick={() => setDraft(p => ({ ...p, type: t }))}>{t}</button>)}</div></section><section><h3>Bedrooms</h3><div className="amenity-options">{[-1, 0, 1, 2, 3].map(n => <button className={draft.beds === n ? "selected" : ""} key={n} onClick={() => setDraft(p => ({ ...p, beds: n }))}>{n === -1 ? "Any" : n === 0 ? "Studio" : `${n}+`}</button>)}</div></section><section><h3>The essentials</h3><div className="filter-checks">{AMENITIES.map(a => <label className="check-row" key={a}><input type="checkbox" checked={draft.amenities.includes(a)} onChange={() => setDraft(p => ({ ...p, amenities: p.amenities.includes(a) ? p.amenities.filter(v => v !== a) : [...p.amenities, a] }))} /><span>{a}</span></label>)}</div></section><section><label className="field"><span>Available by your move-in date</span><input type="date" value={draft.moveIn} onChange={e => setDraft(p => ({ ...p, moveIn: e.target.value }))} /></label></section><div className="filter-actions"><button className="text-button" onClick={() => setDraft(DEFAULT_FILTERS)}>Reset all</button><button className="button primary" onClick={() => onApply(draft)}>Show matching homes<ArrowRight size={16} /></button></div></div></Modal>;
}

function Inbox({ data, refresh, notify }: { data: AppData; refresh: () => Promise<void>; notify: (s: string, e?: boolean) => void }) {
  const [busy, setBusy] = useState("");
  async function reply(id: string, e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); const value = new FormData(e.currentTarget).get("reply"); setBusy(id); try { await api("/api/inquiries", { id, reply: value }, "PATCH"); await refresh(); notify("Your reply was saved in this conversation."); } catch (e) { notify(e instanceof Error ? e.message : "Please try again.", true); } finally { setBusy(""); } }
  if (!data.inquiries.length) return <Empty title="No inquiries yet" description="Your rental inquiries and owner replies will appear here." />;
  return <div className="inbox-list">{data.inquiries.map(item => <article className="inquiry-item" key={item.id}><div className="inquiry-item-heading"><span className="lister-avatar"><MessageCircle size={22} /></span><div><span className="eyebrow">{item.isDemo ? "DEMO INQUIRY" : item.renterId === data.session?.userId ? "YOUR INQUIRY" : "RENTER INQUIRY"}</span><h3>{item.listingTitle}</h3></div><time>{new Date(item.createdAt).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })}</time></div><div className="inquiry-message"><strong>{item.renterName}</strong><p>{item.message}</p><span>Move-in: {item.moveIn} · {item.occupants} occupant{item.occupants > 1 ? "s" : ""}</span></div>{item.reply ? <div className="inquiry-reply"><strong>Lister reply</strong><p>{item.reply}</p></div> : (item.ownerId === data.session?.userId || data.session?.isAdmin) ? <form onSubmit={e => reply(item.id, e)} className="reply-form"><label className="field"><span>{item.isDemo ? "Try a sample reply" : "Reply to this renter"}</span><textarea name="reply" required minLength={5} maxLength={2000} rows={3} placeholder="Share availability or suggest a viewing time." /></label><button className="button primary" disabled={busy === item.id}>{busy === item.id ? "Saving…" : "Save reply"}<ArrowRight size={15} /></button></form> : <p className="waiting-reply">Waiting for a reply. Check back here for updates.</p>}{item.isDemo && <p className="form-help">Demo conversation only. No external messages are sent.</p>}</article>)}</div>;
}

function Review({ data, action, busy, open, refresh, notify }: { data: AppData; action: (h: Listing, a: string, r?: string) => Promise<void>; busy: boolean; open: (h: Listing) => void; refresh: () => Promise<void>; notify: (s: string, e?: boolean) => void }) {
  const [notes, setNotes] = useState<Record<string, string>>({}), [checked, setChecked] = useState<string[]>([]);
  if (!data.session?.isAdmin) return <Empty title="Reviewer access required" description="This area is available to the site's administrator." />;
  const pending = data.reviewListings.filter(p => p.status === "pending"), flags = data.reports.filter(r => r.status === "open");
  return <>{data.pilot?.usage && <section className="pilot-summary" aria-label="Pilot usage"><div><span className="eyebrow">PILOT USAGE</span><h2>{data.pilot.usage.properties} of {PILOT_LIMITS.properties} property places used</h2><p>{data.pilot.usage.photos} of {PILOT_LIMITS.storedPhotos} photos · {(data.pilot.usage.bytes / 1024 / 1024).toFixed(1)} of {PILOT_LIMITS.storageBytes / 1024 / 1024} MB reserved</p>{data.pilot.usage.pendingPhotos > 0 && <p>{data.pilot.usage.pendingPhotos} uploads need checking. Their storage stays reserved until they are resolved.</p>}</div><p>Listings wait for your approval. Uploads pause when the pilot limits are reached. These counts cover Malapit’s photo bucket, not other services or account billing.</p></section>}<div className="stat-grid"><div><span>Awaiting review</span><strong>{pending.length}</strong></div><div><span>CHANGES REQUESTED</span><strong>{data.reviewListings.length - pending.length}</strong></div><div><span>OPEN REPORTS</span><strong>{flags.length}</strong></div></div><h2 className="workspace-section-title">Property submissions</h2>{data.reviewListings.length ? <div className="review-list">{data.reviewListings.map(home => <article className="review-card" key={home.id}><div className="review-property"><img src={home.photos[0]} alt={home.title} /><div><span className={`status status-${home.status}`}>{statusLabel(home.status)}</span><h3>{home.title}</h3><p>{home.address}</p><p>{home.ownerName} · {home.role}</p><strong>{money(home.price)} / month</strong><button className="text-link" onClick={() => open(home)}>Review all details<ArrowRight size={14} /></button></div></div>{home.status === "pending" ? <><label className="check-row review-check"><input type="checkbox" checked={checked.includes(home.id)} onChange={() => setChecked(p => p.includes(home.id) ? p.filter(id => id !== home.id) : [...p, home.id])} /><span>I have checked the lister's authority, location, photos, and price details.</span></label><label className="field"><span>Correction note, if needed</span><input value={notes[home.id] || ""} onChange={e => setNotes(p => ({ ...p, [home.id]: e.target.value }))} placeholder="Explain what the lister needs to change." maxLength={500} /></label><div className="review-actions"><button className="button secondary" disabled={busy} onClick={() => action(home, "withdraw")}>Remove from pilot</button><button className="button secondary" disabled={busy} onClick={() => action(home, "reject", notes[home.id])}>Request changes</button><button className="button primary" disabled={busy || !checked.includes(home.id)} onClick={() => action(home, "approve")}><Check size={16} />Approve listing</button></div></> : <p className="review-note">Waiting for the lister to update and resubmit. {home.reviewNote}<button className="text-link" disabled={busy} onClick={() => action(home, "withdraw")}>Remove from pilot</button></p>}</article>)}</div> : <Empty title="The queue is looking good" description="New property submissions will appear here for review." />}<h2 className="workspace-section-title">Listing reports</h2>{flags.length ? <div className="report-list">{flags.map(flag => <article className="report-card" key={flag.id}><div><span className="eyebrow">{flag.listingId.startsWith("demo-") ? "DEMO LISTING REPORT" : "LISTING REPORT"}</span><p>{flag.reason}</p><small>Listing: {flag.listingId}</small></div><button className="button secondary" onClick={async () => { try { await api("/api/reports", { id: flag.id }, "PATCH"); await refresh(); notify("Report marked as resolved."); } catch (e) { notify(e instanceof Error ? e.message : "Please try again.", true); } }}>Mark resolved<Check size={15} /></button></article>)}</div> : <p className="muted-text">No open reports.</p>}</>;
}
