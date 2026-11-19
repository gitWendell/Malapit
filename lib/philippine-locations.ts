import { CITIES } from "./types.ts";

export type LocationPoint = [number, number];
export type LocationCity = { code: string; name: string; officialName: string; provinceCode: string; provinceName: string; label: string; areaCode: string; point?: LocationPoint };
export type LocationBarangay = { code: string; name: string; district?: string; point?: LocationPoint };
export type LocationIndex = { version: string; provinces: { code: string; name: string }[]; cities: LocationCity[] };
export type LocationArea = { code: string; cities: Record<string, LocationBarangay[]> };

export const normalizePlace = (value: string) => value.trim().toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
const looseCity = (value: string) => normalizePlace(value).replace(/^city of /, "").replace(/ city$/, "");

export function findLocationCity(cities: LocationCity[], saved: string): LocationCity | undefined {
  if (!saved.trim()) return undefined;
  const exact = cities.find(city => normalizePlace(city.label) === normalizePlace(saved));
  if (exact) return exact;
  const [name, ...province] = saved.split(","), area = normalizePlace(province.join(","));
  const candidates = cities.filter(city => !area || normalizePlace(city.provinceName) === area);
  const named = candidates.filter(city => normalizePlace(city.name) === normalizePlace(name) || normalizePlace(city.officialName) === normalizePlace(name));
  if (named.length === 1) return named[0];
  const loose = candidates.filter(city => looseCity(city.name) === looseCity(name));
  return loose.length === 1 ? loose[0] : undefined;
}

export function barangayLabel(barangay: LocationBarangay): string {
  return barangay.district ? `${barangay.name}, ${barangay.district}` : barangay.name;
}

export function findLocationBarangay(barangays: LocationBarangay[], saved: string): LocationBarangay | undefined {
  const exact = barangays.find(barangay => normalizePlace(barangayLabel(barangay)) === normalizePlace(saved));
  if (exact) return exact;
  const matches = barangays.filter(barangay => normalizePlace(barangay.name) === normalizePlace(saved));
  return matches.length === 1 ? matches[0] : undefined;
}

export function cityMapView(city: LocationCity, cities: LocationCity[]): { center: LocationPoint; zoom: number } {
  const known = CITIES.find(place => looseCity(place.name) === looseCity(city.name));
  if (known) return { center: [known.lat, known.lng], zoom: known.zoom };
  if (city.point) return { center: city.point, zoom: 13 };
  const nearby = cities.filter(place => place.provinceCode === city.provinceCode && place.point).map(place => place.point!);
  if (nearby.length) return { center: [nearby.reduce((sum, value) => sum + value[0], 0) / nearby.length, nearby.reduce((sum, value) => sum + value[1], 0) / nearby.length], zoom: 10 };
  return { center: [12.4, 122], zoom: 6 };
}

const METRO_MANILA_CITIES = new Set(["makati", "taguig", "quezon", "manila", "pasig", "mandaluyong", "pasay", "paranaque", "las pinas", "muntinlupa", "san juan", "marikina", "caloocan", "valenzuela", "malabon", "navotas", "pateros"]);
export function isMetroManilaCity(value: string): boolean {
  const [name, ...province] = value.split(",");
  return (!province.length || normalizePlace(province.join(",")) === "metro manila") && METRO_MANILA_CITIES.has(looseCity(name));
}
