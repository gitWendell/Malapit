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
  onPick?: (p: [number, number]) => void; onConfirmPick?: (p: [number, number]) => void; pickValue?: [number, number] | null; compact?: boolean };

export default function RentalMap({ listings = [], center, zoom = 13, viewRequest = 0, selected, focusRequest = 0, hovered, onSelect, onBounds, onPick, onConfirmPick, pickValue, compact }: Props) {
  const container = useRef<HTMLDivElement>(null), map = useRef<Leaflet.Map | null>(null);
  const library = useRef<typeof Leaflet | null>(null), markers = useRef<Leaflet.LayerGroup | null>(null);
  const pickedMarker = useRef<Leaflet.Marker | null>(null);
  const searchAfterMove = useRef(false), searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function prepareMapMove(search = false) {
    searchAfterMove.current = search;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = null;
  }
  const picking = Boolean(onPick);
  const pickerState = useRef({ center, pickValue }); pickerState.current = { center, pickValue };
  const priceMarkers = useRef(new Map<string, { marker: Leaflet.Marker; button: HTMLButtonElement }>());
  const callbacks = useRef({ onSelect, onBounds, onPick, onConfirmPick }); callbacks.current = { onSelect, onBounds, onPick, onConfirmPick };
  const [ready, setReady] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    let gone = false; let observer: ResizeObserver | null = null;
    import("leaflet").then(L => {
      if (gone || !container.current) return;
      library.current = L;
      const instance = L.map(container.current, { center, zoom, zoomControl: false, scrollWheelZoom: !picking, maxBounds: [[3.5, 114.5], [22.5, 129]], minZoom: 5, maxZoom: 19 });
      map.current = instance;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors', maxZoom: 19 }).addTo(instance);
      markers.current = L.layerGroup().addTo(instance);
      instance.on("movestart", () => { if (searchTimer.current) clearTimeout(searchTimer.current); searchTimer.current = null; });
      instance.on("dragstart boxzoomstart", () => { searchAfterMove.current = true; });
      instance.on("moveend", () => {
        if (!searchAfterMove.current || !callbacks.current.onBounds) return;
        prepareMapMove();
        searchTimer.current = setTimeout(() => {
          searchTimer.current = null;
          const b = instance.getBounds();
          callbacks.current.onBounds?.({ south: b.getSouth(), north: b.getNorth(), west: b.getWest(), east: b.getEast() });
        }, 350);
      });
      instance.on("click", (e: Leaflet.LeafletMouseEvent) => callbacks.current.onPick?.([Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))]));
      observer = new ResizeObserver(() => instance.invalidateSize()); observer.observe(container.current);
      setReady(true);
    }).catch(() => setError(picking ? "The map could not load. Please reload and try again." : "The map could not load. You can still browse the homes in the list."));
    return () => { gone = true; prepareMapMove(); observer?.disconnect(); map.current?.remove(); map.current = null; setReady(false); };
  }, []);
  useEffect(() => { if (ready) { prepareMapMove(); map.current?.invalidateSize(); map.current?.setView(center, zoom, { animate: false }); } }, [ready, center[0], center[1], zoom, viewRequest]);
  useEffect(() => {
    const L = library.current, instance = map.current;
    if (!ready || !picking || !L || !instance) return;
    const node = document.createElement("div"); node.className = "picked-pin";
    const marker = L.marker(pickerState.current.pickValue || pickerState.current.center, {
      icon: L.divIcon({ html: node, className: "map-marker-shell property-location-marker", iconSize: [44, 52], iconAnchor: [22, 44] }),
      draggable: true, autoPan: true, keyboard: true, title: "Drag the pin to your property", alt: "Property location pin",
    }).addTo(instance);
    pickedMarker.current = marker;
    const choose = (confirm = false) => { const point = marker.getLatLng(); const position: [number, number] = [Number(point.lat.toFixed(6)), Number(point.lng.toFixed(6))]; if (confirm && callbacks.current.onConfirmPick) callbacks.current.onConfirmPick(position); else callbacks.current.onPick?.(position); };
    marker.on("dragend", () => choose());
    const element = marker.getElement();
    element?.setAttribute("aria-label", "Property location pin. Drag or use arrow keys to move. Press Enter to confirm.");
    const moveWithKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); choose(true); return; }
      const shifts: Record<string, [number, number]> = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] };
      const shift = shifts[event.key]; if (!shift) return;
      event.preventDefault(); event.stopPropagation();
      const position = instance.latLngToContainerPoint(marker.getLatLng()).add(shift);
      marker.setLatLng(instance.containerPointToLatLng(position));
      instance.panInside(marker.getLatLng(), { padding: [30, 30], animate: false }); choose();
    };
    element?.addEventListener("keydown", moveWithKeyboard);
    return () => { element?.removeEventListener("keydown", moveWithKeyboard); marker.remove(); pickedMarker.current = null; };
  }, [ready, picking]);
  useEffect(() => {
    const marker = pickedMarker.current;
    if (!ready || !marker) return;
    const point = pickValue || center;
    if (!marker.getLatLng().equals(point)) marker.setLatLng(point);
    marker.setOpacity(pickValue ? 1 : .65);
  }, [ready, picking, pickValue?.[0], pickValue?.[1], center[0], center[1]]);
  useEffect(() => {
    const L = library.current, layer = markers.current;
    if (!ready || !L || !layer) return;
    layer.clearLayers();
    priceMarkers.current.clear();
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
  }, [ready, listings]);
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
        if (!instance.getBounds().pad(-.15).contains(point)) { prepareMapMove(); instance.panInside(point, {
          padding: [Math.min(80, size.x / 5), Math.min(100, size.y / 5)],
          animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
          duration: .3,
        }); }
      }
    }
  }, [ready, listings, selected, hovered]);
  useEffect(() => {
    const instance = map.current, point = selected ? priceMarkers.current.get(selected)?.marker.getLatLng() : null;
    if (!ready || !instance || !point || !focusRequest) return;
    prepareMapMove();
    instance.invalidateSize({ pan: false });
    const size = instance.getSize();
    if (size.x > 0 && size.y > 0) instance.stop().setView(point, Math.max(instance.getZoom(), 15), {
      animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    });
  }, [ready, selected, focusRequest]);
  return <div className={`rental-map ${compact ? "compact-map" : ""}`} onDoubleClickCapture={() => { if (!picking) searchAfterMove.current = true; }} onWheelCapture={() => { if (!picking) searchAfterMove.current = true; }} onTouchStartCapture={() => { if (!picking) searchAfterMove.current = true; }} onKeyDownCapture={event => { if (!picking && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "-", "=", "_"].includes(event.key)) searchAfterMove.current = true; }}>
    <div ref={container} className="leaflet-host" aria-label={onPick ? "Choose the property location on the map" : "Rental homes on the map"} />
    {!ready && <div className="map-loading"><MapPin size={28} /><span>{error || "Finding your neighborhood…"}</span></div>}
    <div className="map-zoom-controls">
      <button type="button" aria-label="Zoom in" onClick={() => { prepareMapMove(true); map.current?.zoomIn(); }}><Plus size={18} /></button>
      <button type="button" aria-label="Zoom out" onClick={() => { prepareMapMove(true); map.current?.zoomOut(); }}><Minus size={18} /></button>
      <button type="button" aria-label={picking ? "Show property pin" : "Return to selected location"} onClick={() => { prepareMapMove(true); map.current?.setView(pickedMarker.current?.getLatLng() || pickValue || priceMarkers.current.get(selected || "")?.marker.getLatLng() || center, selected ? Math.max(zoom, 15) : zoom, { animate: false }); }}><LocateFixed size={18} /></button>
    </div>
    {onPick && <div className="map-pick-toolbar"><span className="map-pick-hint"><MapPin size={16} />{pickValue ? "Drag or tap to adjust." : "Drag the pin or tap the map."}</span><button type="button" className="button primary" disabled={!ready} onClick={() => { const point = pickedMarker.current?.getLatLng(); if (point) { const position: [number, number] = [Number(point.lat.toFixed(6)), Number(point.lng.toFixed(6))]; if (callbacks.current.onConfirmPick) callbacks.current.onConfirmPick(position); else callbacks.current.onPick?.(position); } }}>{onConfirmPick ? "Confirm & continue" : "Confirm pin"}</button></div>}
  </div>;
}
