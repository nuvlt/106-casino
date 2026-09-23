import type { Metadata, Viewport } from "next";
import "./globals.css";
import { HowItWorks } from "@/components/HowItWorks";

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
      <body>
        {/*
          globals.css'deki `body > * { position: relative; z-index: 1 }`
          kuralı, kumaş dokusu overlay'inin (body::before, z-index: 0)
          üstünde kalmaları için body'nin DOĞRUDAN çocuklarına uygulanıyor.
          Bu kural katmansız (unlayered) olduğundan Tailwind'in `.fixed`
          sınıfını her zaman eziyor — HowItWorks'ün sabit "i" düğmesi
          doğrudan body çocuğu olsaydı position:fixed hiç çalışmazdı. Tek
          bir sarmalayıcıya alıp kuralın yalnızca bu sarmalayıcıya
          uygulanmasını sağlıyoruz; içindeki `fixed` öğeler artık
          etkilenmiyor.
        */}
        <div className="relative z-[1]">
          {children}
          <HowItWorks />
        </div>
      </body>
    </html>
  );
}
