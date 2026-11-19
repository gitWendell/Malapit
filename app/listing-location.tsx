"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle, MapPin } from "lucide-react";
import { DEFAULT_CITY } from "../lib/types";
import { barangayLabel, cityMapView, findLocationBarangay, findLocationCity, type LocationArea, type LocationIndex, type LocationPoint } from "../lib/philippine-locations";
import RentalMap from "./rental-map";

export type ListingLocationValue = { city: string; neighborhood: string; address: string; lat: number; lng: number; exactLocation: boolean };
type Props = { value: ListingLocationValue; editing: boolean; onChange: (patch: Partial<ListingLocationValue>) => void };

export default function ListingLocation({ value, editing, onChange }: Props) {
  const [index, setIndex] = useState<LocationIndex | null>(null), [indexError, setIndexError] = useState(false), [reload, setReload] = useState(0);
  const [area, setArea] = useState<LocationArea | null>(null), [areaError, setAreaError] = useState(false), [areaReload, setAreaReload] = useState(0);
  const [province, setProvince] = useState("");
  const currentPin = useRef<LocationPoint | null>(null);
  currentPin.current = value.lat && value.lng ? [value.lat, value.lng] : null;
  const [view, setView] = useState<{ center: LocationPoint; zoom: number }>(() => ({ center: currentPin.current || [DEFAULT_CITY.lat, DEFAULT_CITY.lng], zoom: currentPin.current ? 16 : DEFAULT_CITY.zoom }));
  const selectedCity = index ? findLocationCity(index.cities, value.city) : undefined;
  const selectedProvince = selectedCity?.provinceCode || province;
  const currentArea = area?.code === selectedCity?.areaCode ? area : null;
  const barangays = selectedCity && currentArea ? currentArea.cities[selectedCity.code] || [] : [];
  const selectedBarangay = findLocationBarangay(barangays, value.neighborhood);
  const savedCity = editing && Boolean(value.city) && !selectedCity;
  const savedBarangay = editing && Boolean(value.neighborhood) && !selectedBarangay;

  useEffect(() => {
    const controller = new AbortController();
    setIndexError(false);
    fetch("/locations/index.json", { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error("Place list unavailable");
      return response.json() as Promise<LocationIndex>;
    }).then(result => { if (!controller.signal.aborted) setIndex(result); }).catch(() => { if (!controller.signal.aborted) setIndexError(true); });
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    if (!selectedCity) return;
    const controller = new AbortController();
    setAreaError(false);
    const code = selectedCity.areaCode;
    fetch(`/locations/areas/${encodeURIComponent(code)}.json`, { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error("Barangay list unavailable");
      return response.json() as Promise<LocationArea>;
    }).then(result => { if (!controller.signal.aborted) setArea(result); }).catch(() => { if (!controller.signal.aborted) setAreaError(true); });
    return () => controller.abort();
  }, [selectedCity?.areaCode, areaReload]);

  useEffect(() => {
    if (!selectedCity || !index) return;
    if (currentPin.current) setView({ center: currentPin.current, zoom: 16 });
    else if (selectedBarangay?.point) setView({ center: selectedBarangay.point, zoom: 16 });
    else setView(cityMapView(selectedCity, index.cities));
  }, [selectedCity, selectedBarangay, index]);

  const readyForMap = Boolean(value.neighborhood && (selectedCity || savedCity));
  return <div className="form-grid listing-location-fields">
    <label className="field"><span>Province or area</span><select required={!savedCity} disabled={!index} value={savedCity ? "__saved__" : selectedProvince} onChange={event => { setProvince(event.target.value); onChange({ city: "", neighborhood: "", lat: 0, lng: 0 }); }}>
      <option value="">{index ? "Choose a province or area" : "Loading places…"}</option>
      {savedCity && <option value="__saved__">Keep saved location</option>}
      {index?.provinces.map(place => <option key={place.code} value={place.code}>{place.name}</option>)}
    </select></label>
    <label className="field"><span>City or municipality</span><select required disabled={!index || (!selectedProvince && !savedCity)} value={selectedCity?.code || (savedCity ? "__saved__" : "")} onChange={event => { const city = index?.cities.find(place => place.code === event.target.value); onChange({ city: city?.label || "", neighborhood: "", lat: 0, lng: 0 }); }}>
      <option value="">{selectedProvince ? "Choose a city or municipality" : "Choose a province first"}</option>
      {savedCity && <option value="__saved__">{value.city} (saved)</option>}
      {index?.cities.filter(place => place.provinceCode === selectedProvince).map(place => <option key={place.code} value={place.code}>{place.name}</option>)}
    </select></label>
    {indexError && <p className="location-load-error full" role="alert">We couldn’t load the place list. <button type="button" className="text-link" onClick={() => setReload(count => count + 1)}>Try again</button></p>}
    <label className="field full"><span>Barangay</span><select required disabled={!currentArea && !savedBarangay} value={selectedBarangay?.code || (savedBarangay ? "__saved__" : "")} onChange={event => { const barangay = barangays.find(place => place.code === event.target.value); onChange({ city: selectedCity?.label || value.city, neighborhood: barangay ? barangayLabel(barangay) : "", lat: 0, lng: 0 }); }}>
      <option value="">{!selectedCity ? "Choose a city first" : currentArea ? "Choose your barangay" : "Loading barangays…"}</option>
      {savedBarangay && <option value="__saved__">{value.neighborhood} (saved)</option>}
      {barangays.map(place => <option key={place.code} value={place.code}>{barangayLabel(place)}</option>)}
    </select><small>Choose the barangay where the property is located.</small></label>
    {selectedCity && !currentArea && !areaError && <p className="location-loading full" role="status"><LoaderCircle size={16} className="spin" />Loading barangays…</p>}
    {areaError && <p className="location-load-error full" role="alert">We couldn’t load the barangays. <button type="button" className="text-link" onClick={() => setAreaReload(count => count + 1)}>Try again</button></p>}
    <label className="field full"><span>Building and street address</span><input required minLength={8} maxLength={240} placeholder="e.g. Building name, house number, street" value={value.address} onChange={event => onChange({ address: event.target.value })} /></label>
    <div className="full location-pin-intro"><h4>Place your property pin</h4><p>Drag the pin to your property’s entrance, or tap the right spot on the map.</p></div>
    {readyForMap ? <>
      <div className="full form-map"><RentalMap compact center={view.center} zoom={view.zoom} pickValue={value.lat && value.lng ? [value.lat, value.lng] : null} onPick={point => onChange({ lat: point[0], lng: point[1] })} /></div>
      <p className={`full location-pin-status ${value.lat && value.lng ? "is-placed" : ""}`} role="status">{value.lat && value.lng ? <><CheckCircle2 size={17} />Pin placed. You can drag it again to adjust.</> : <><MapPin size={17} />Move the pin, tap the map, or confirm the pin if it is already correct.</>}</p>
    </> : <div className="full location-map-placeholder"><MapPin size={25} /><p>Choose your city and barangay to open the map.</p></div>}
    <label className="check-row full"><input type="checkbox" checked={value.exactLocation} onChange={event => onChange({ exactLocation: event.target.checked })} /><span>Show the exact location publicly<small>When unchecked, renters see an approximate pin and neighborhood.</small></span></label>
    <p className="full location-source">Place names from the <a href="https://psa.gov.ph/classification/psgc" target="_blank" rel="noreferrer">Philippine Statistics Authority</a>.</p>
  </div>;
}
