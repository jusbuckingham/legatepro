import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },

  experimental: {
    serverActions: {
      // Default body size limit for server actions (adjust as needed)
      bodySizeLimit: "2mb",
      // allowedOrigins: ["http://localhost:3000"], // Uncomment and adjust in production
    },
  },
};

export default nextConfig;
