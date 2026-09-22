import type { NextConfig } from "next";

/**
 * Temel güvenlik başlıkları. Sayfa başka bir sitenin içine (iframe)
 * gömülemez — oyuncuyu görünmez düğmelere tıklatma (clickjacking)
 * denemelerine karşı. Tarayıcı dosya türünü tahmin etmez, eklenti
 * nesneleri yüklenmez.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Oyun sonuçları sunucuda üretilir; hiçbir tur verisi önbelleğe alınmaz.
  typedRoutes: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
