import type { Listing } from "./types";
const examples = [
  ["1BR condo in Legazpi Village", "Makati", "Legazpi Village", 14.554, 121.018, "Condo", 18000, 1, 1, 32, 1, ["Furnished", "Wi-Fi", "Air conditioning", "Kitchen", "Pet friendly"]],
  ["Furnished 1BR condo in BGC", "Taguig", "Bonifacio Global City", 14.549, 121.049, "Condo", 24000, 1, 1, 38, 2, ["Furnished", "Air conditioning", "Kitchen", "Parking"]],
  ["1BR apartment in Poblacion", "Makati", "Poblacion", 14.565, 121.031, "Apartment", 12500, 1, 1, 28, 6, ["Own meter", "Kitchen", "Pet friendly", "Visitors allowed"]],
  ["2BR apartment in Highway Hills", "Mandaluyong", "Highway Hills", 14.577, 121.053, "Apartment", 14500, 2, 1, 42, 5, ["Wi-Fi", "Kitchen", "Own meter", "No curfew"]],
  ["Furnished room in San Antonio", "Makati", "San Antonio", 14.563, 121.011, "Room", 7500, 1, 1, 18, 8, ["Wi-Fi", "Furnished", "Laundry", "Air conditioning"]],
  ["Furnished studio in Ortigas", "Pasig", "Ortigas Center", 14.585, 121.062, "Condo", 16500, 0, 1, 26, 7, ["Furnished", "Air conditioning", "Kitchen", "Wi-Fi"]],
  ["2BR house in Pinagsama", "Taguig", "Pinagsama", 14.526, 121.054, "House", 22000, 2, 2, 65, 3, ["Parking", "Pet friendly", "Kitchen", "Own meter"]],
  ["Room in Guadalupe Nuevo", "Makati", "Guadalupe Nuevo", 14.561, 121.044, "Room", 6500, 1, 1, 16, 4, ["Wi-Fi", "Own meter", "Kitchen"]],
  ["Bedspace near Boni", "Mandaluyong", "Boni", 14.567, 121.042, "Bedspace", 4500, 1, 1, 12, 5, ["Wi-Fi", "Furnished", "Laundry"]],
  ["Furnished 1BR condo in Salcedo", "Makati", "Salcedo Village", 14.560, 121.025, "Condo", 21000, 1, 1, 35, 8, ["Furnished", "Pet friendly", "Air conditioning", "Wi-Fi"]],
  ["1BR apartment in Diliman", "Quezon City", "Diliman", 14.648, 121.056, "Apartment", 11000, 1, 1, 30, 1, ["Kitchen", "Own meter", "Pet friendly", "Parking"]],
  ["Furnished room in Sampaloc", "Manila", "Sampaloc", 14.612, 120.991, "Room", 5500, 1, 1, 15, 6, ["Wi-Fi", "Furnished", "Visitors allowed"]],
  ["Furnished 1BR condo in Lahug", "Cebu City", "Lahug", 10.333, 123.902, "Condo", 15000, 1, 1, 30, 2, ["Air conditioning", "Furnished", "Kitchen", "Wi-Fi"]],
  ["1BR apartment in Mabolo", "Cebu City", "Mabolo", 10.321, 123.915, "Apartment", 9500, 1, 1, 26, 4, ["Own meter", "Kitchen", "Pet friendly"]],
  ["Furnished room in Banilad", "Cebu City", "Banilad", 10.352, 123.915, "Room", 6000, 1, 1, 17, 5, ["Wi-Fi", "Air conditioning", "Furnished"]],
  ["2BR apartment in Bajada", "Davao City", "Bajada", 7.092, 125.612, "Apartment", 10000, 2, 1, 40, 6, ["Own meter", "Kitchen", "Parking"]],
  ["Furnished 1BR condo in Ecoland", "Davao City", "Ecoland", 7.05, 125.595, "Condo", 13500, 1, 1, 29, 8, ["Furnished", "Air conditioning", "Kitchen"]],
  ["1BR apartment near Burnham", "Baguio", "Burnham", 16.408, 120.592, "Apartment", 12000, 1, 1, 32, 1, ["Wi-Fi", "Kitchen", "Furnished", "Pet friendly"]],
] as const;
export const DEMO_LISTINGS: Listing[] = examples.map((row, i) => ({
  id: `demo-${i + 1}`, ownerId: "demo-owner", ownerName: ["Mika Santos", "Paolo Reyes", "Andrea Cruz"][i % 3], title: row[0], city: row[1], neighborhood: row[2], address: `${row[2]}, ${row[1]}, Philippines`, lat: row[3], lng: row[4], type: row[5], price: row[6], bedrooms: row[7], bathrooms: row[8], area: row[9], priceBasis: row[5] === "Bedspace" ? "per person" : row[5] === "Room" ? "per room" : "entire unit",
  photos: [`/homes/home-${row[10]}.jpg`, `/homes/home-${(row[10] % 8) + 1}.jpg`, `/homes/home-${((row[10] + 2) % 8) + 1}.jpg`], amenities: [...row[11]], deposit: row[6] * 2, advance: row[6], monthlyFees: i % 3 === 0 ? 800 : 0, utilities: "Electricity and water are billed separately. Ask about the meter and current rates.", minLease: 6, availableFrom: "2026-12-01", role: "Direct owner", exactLocation: false,
  description: "This is a fictional rental listing for trying the map, filters, and inquiry tools. Review the sample price breakdown, amenities, and lease terms below.\n\nThe photos, price, location, and owner details are examples. This property is not available to rent.", status: "published", reviewNote: "", createdAt: "2026-11-11T00:00:00.000Z", confirmedAt: "2026-11-11T00:00:00.000Z", isDemo: true,
}));
