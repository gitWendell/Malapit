import type { Metadata, Viewport } from "next";
import { PUBLIC_SITE_URL, RELEASE_VERSION } from "../lib/release";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_SITE_URL),
  generator: `Malapit ${RELEASE_VERSION}`,
  title: "Malapit · Rentals on the map, Philippines",
  description: "Explore rooms, apartments, condos, and houses across the Philippines. Find your next place on the map, with clear prices and rental details.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
  applicationName: "Malapit",
  openGraph: {
    type: "website", url: PUBLIC_SITE_URL, siteName: "Malapit", locale: "en_PH",
    title: "Malapit · Find rentals near you",
    description: "Find Philippine rentals on the map. Compare places, contact listers and manage your rental in one place.",
    images: [{ url: "/icons/icon-512.png", width: 512, height: 512, alt: "Malapit rentals" }],
  },
  twitter: { card: "summary", title: "Malapit · Find rentals near you", description: "Find Philippine rentals on the map.", images: ["/icons/icon-512.png"] },
  appleWebApp: { capable: true, title: "Malapit", statusBarStyle: "default" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#fffaf7" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head><link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" /></head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
