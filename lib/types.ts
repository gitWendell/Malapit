export const PROPERTY_TYPES = ["All homes", "Apartment", "Condo", "House", "Room", "Bedspace"] as const;
export const AMENITIES = ["Wi-Fi", "Air conditioning", "Pet friendly", "Parking", "Own meter", "Kitchen", "Furnished", "Laundry", "Visitors allowed", "No curfew"];
export type ListingStatus = "pending" | "published" | "paused" | "rented" | "changes_requested" | "withdrawn";
export type Listing = {
  id: string; ownerId: string; ownerName: string; title: string; city: string; neighborhood: string; address: string; lat: number; lng: number;
  type: string; price: number; priceBasis: string; bedrooms: number; bathrooms: number; area: number; description: string;
  photos: string[]; amenities: string[]; deposit: number; advance: number; monthlyFees: number; utilities: string;
  minLease: number; availableFrom: string; role: string; exactLocation: boolean; status: ListingStatus;
  reviewNote: string; createdAt: string; confirmedAt: string; isDemo?: boolean;
};
export type Session = { userId: string; displayName: string; email: string; isAdmin: boolean } | null;
export type Inquiry = { id: string; listingId: string; listingTitle: string; ownerId: string; renterId: string; renterName: string; renterEmail: string; message: string; moveIn: string; occupants: number; reply: string; isDemo: number; createdAt: string };
export type Report = { id: string; listingId: string; userId: string; reason: string; status: string; createdAt: string };
export type AppData = { session: Session; listings: Listing[]; myListings: Listing[]; reviewListings: Listing[]; savedIds: string[]; inquiries: Inquiry[]; reports: Report[]; pilot?: import("./pilot-limits").PilotStatus };
export const money = (amount: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(amount);
export const shortMoney = (amount: number) => amount >= 1000 ? `₱${Number((amount / 1000).toFixed(1))}k` : money(amount);
export function distanceKm(a: [number, number], b: [number, number]) {
  const rad = Math.PI / 180, dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
export const CITIES = [
  { name: "Metro Manila", lat: 14.565, lng: 121.035, zoom: 12 }, { name: "Makati", lat: 14.5547, lng: 121.0244, zoom: 14 },
  { name: "Taguig", lat: 14.5378, lng: 121.0515, zoom: 14 }, { name: "Quezon City", lat: 14.676, lng: 121.0437, zoom: 13 },
  { name: "Manila", lat: 14.5995, lng: 120.9842, zoom: 13 }, { name: "Pasig", lat: 14.5764, lng: 121.0851, zoom: 14 },
  { name: "Mandaluyong", lat: 14.5794, lng: 121.0359, zoom: 14 }, { name: "Cebu City", lat: 10.3157, lng: 123.8854, zoom: 13 },
  { name: "Davao City", lat: 7.0731, lng: 125.6128, zoom: 13 }, { name: "Baguio", lat: 16.4023, lng: 120.596, zoom: 13 },
  { name: "Iloilo City", lat: 10.7202, lng: 122.5621, zoom: 13 }, { name: "Bacolod", lat: 10.6765, lng: 122.9509, zoom: 13 },
  { name: "Cagayan de Oro", lat: 8.4542, lng: 124.6319, zoom: 13 }, { name: "Antipolo", lat: 14.6255, lng: 121.1245, zoom: 13 },
  { name: "Dumaguete", lat: 9.3068, lng: 123.3054, zoom: 13 }, { name: "Puerto Princesa", lat: 9.7392, lng: 118.7353, zoom: 13 },
];
