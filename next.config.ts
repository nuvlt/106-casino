import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Oyun sonuçları sunucuda üretilir; hiçbir tur verisi önbelleğe alınmaz.
  experimental: { typedRoutes: true },
};

export default nextConfig;
