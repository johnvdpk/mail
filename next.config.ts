import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Smaller production image for Docker / VPS
  output: "standalone",
};

export default nextConfig;
