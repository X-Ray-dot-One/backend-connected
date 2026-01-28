import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Webpack fallback for Node.js modules not available in browser
  // This is needed for @arcium-hq/client which imports 'fs'
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;
