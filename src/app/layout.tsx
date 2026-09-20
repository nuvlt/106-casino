import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "106 Casino",
  description: "106 Dijital ofis içi oyun platformu — gerçek para yok, sadece gurur.",
};

// Mobile-first: insanlar bunu çay molasında telefondan oynayacak.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a0a14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
