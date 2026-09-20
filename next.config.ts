import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Oyun sonuçları sunucuda üretilir; hiçbir tur verisi önbelleğe alınmaz.
  typedRoutes: true,
};

export default nextConfig;
