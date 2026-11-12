"use client";
import { useEffect, useRef, useState } from "react";
import { MapPin, Minus, Plus, LocateFixed } from "lucide-react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Listing } from "../lib/types";
import { shortMoney } from "../lib/types";

export type MapBounds = { south: number; north: number; west: number; east: number };
type Props = { listings?: Listing[]; center: [number, number]; zoom?: number; viewRequest?: number; selected?: string; focusRequest?: number;
  hovered?: string; onSelect?: (p: Listing) => void; onBounds?: (b: MapBounds) => void;
  onPick?: (p: [number, number]) => void; pickValue?: [number, number] | null; compact?: boolean };

export default function RentalMap({ listings = [], center, zoom = 13, viewRequest = 0, selected, focusRequest = 0, hovered, onSelect, onBounds, onPick, pickValue, compact }: Props) {
  const container = useRef<HTMLDivElement>(null), map = useRef<Leaflet.Map | null>(null);
  const library = useRef<typeof Leaflet | null>(null), markers = useRef<Leaflet.LayerGroup | null>(null);
  const priceMarkers = useRef(new Map<string, { marker: Leaflet.Marker; button: HTMLButtonElement }>());
  const callbacks = useRef({ onSelect, onBounds, onPick }); callbacks.current = { onSelect, onBounds, onPick };
  const [ready, setReady] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    let gone = false; let observer: ResizeObserver | null = null;
    import("leaflet").then(L => {
      if (gone || !container.current) return;
      library.current = L;
      const instance = L.map(container.current, { center, zoom, zoomControl: false, maxBounds: [[3.5, 114.5], [22.5, 129]], minZoom: 5, maxZoom: 19 });
      map.current = instance;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors', maxZoom: 19 }).addTo(instance);
      markers.current = L.layerGroup().addTo(instance);
      instance.on("moveend", () => { const b = instance.getBounds(); callbacks.current.onBounds?.({ south: b.getSouth(), north: b.getNorth(), west: b.getWest(), east: b.getEast() }); });
      instance.on("click", (e: Leaflet.LeafletMouseEvent) => callbacks.current.onPick?.([Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))]));
      observer = new ResizeObserver(() => instance.invalidateSize()); observer.observe(container.current);
      setReady(true);
    }).catch(() => setError("The map could not load. You can still browse the homes in the list."));
    return () => { gone = true; observer?.disconnect(); map.current?.remove(); map.current = null; setReady(false); };
  }, []);
  useEffect(() => { if (ready) { map.current?.invalidateSize(); map.current?.setView(center, zoom, { animate: false }); } }, [ready, center[0], center[1], zoom, viewRequest]);
  useEffect(() => {
    const L = library.current, layer = markers.current;
    if (!ready || !L || !layer) return;
    layer.clearLayers();
    priceMarkers.current.clear();
    if (pickValue) {
      const node = document.createElement("div"); node.className = "picked-pin"; node.textContent = "+";
      L.marker(pickValue, { icon: L.divIcon({ html: node, className: "map-marker-shell", iconSize: [32, 40], iconAnchor: [16, 40] }) }).addTo(layer);
    }
    listings.forEach(p => {
      const button = document.createElement("button"); button.type = "button";
      button.className = "price-pin";
      button.textContent = shortMoney(p.price); button.setAttribute("aria-label", `${p.title}, ${p.price} pesos per month`);
      button.dataset.listingId = p.id;
      const icon = L.divIcon({ html: button, className: "map-marker-shell", iconSize: [68, 36], iconAnchor: [34, 36] });
      const marker = L.marker([p.lat, p.lng], { icon, keyboard: false }).addTo(layer);
      marker.on("click", e => { L.DomEvent.stopPropagation(e); callbacks.current.onSelect?.(p); });
      priceMarkers.current.set(p.id, { marker, button });
    });
  }, [ready, listings, pickValue]);
  useEffect(() => {
    if (!ready) return;
    const activeId = hovered || selected;
    priceMarkers.current.forEach(({ marker, button }, id) => {
      const active = id === activeId;
      button.classList.toggle("is-active", active);
      button.classList.toggle("is-selected", active && id === selected);
      button.setAttribute("aria-pressed", String(active));
      marker.setZIndexOffset(active ? 1500 : 0);
    });
    const instance = map.current, point = hovered ? priceMarkers.current.get(hovered)?.marker.getLatLng() : null;
    if (instance && point) {
      const size = instance.getSize();
      if (size.x > 0 && size.y > 0) {
        instance.stop();
        if (!instance.getBounds().pad(-.15).contains(point)) instance.panInside(point, {
          padding: [Math.min(80, size.x / 5), Math.min(100, size.y / 5)],
          animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
          duration: .3,
        });
      }
    }
  }, [ready, listings, selected, hovered]);
  useEffect(() => {
    const instance = map.current, point = selected ? priceMarkers.current.get(selected)?.marker.getLatLng() : null;
    if (!ready || !instance || !point || !focusRequest) return;
    instance.invalidateSize({ pan: false });
    const size = instance.getSize();
    if (size.x > 0 && size.y > 0) instance.stop().setView(point, Math.max(instance.getZoom(), 15), {
      animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    });
  }, [ready, selected, focusRequest]);
  return <div className={`rental-map ${compact ? "compact-map" : ""}`}>
    <div ref={container} className="leaflet-host" aria-label={onPick ? "Choose the property location on the map" : "Rental homes on the map"} />
    {!ready && <div className="map-loading"><MapPin size={28} /><span>{error || "Finding your neighborhood…"}</span></div>}
    <div className="map-zoom-controls">
      <button aria-label="Zoom in" onClick={() => map.current?.zoomIn()}><Plus size={18} /></button>
      <button aria-label="Zoom out" onClick={() => map.current?.zoomOut()}><Minus size={18} /></button>
      <button aria-label="Return to selected location" onClick={() => map.current?.setView(pickValue || priceMarkers.current.get(selected || "")?.marker.getLatLng() || center, selected ? Math.max(zoom, 15) : zoom, { animate: false })}><LocateFixed size={18} /></button>
    </div>
    {onPick && <div className="map-pick-hint"><MapPin size={14} />{pickValue ? "Pin placed. Tap to move it." : "Tap the map to place your pin"}</div>}
  </div>;
}
