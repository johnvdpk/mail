import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Smaller production image for Docker / VPS
  output: "standalone",
  // Keep out of webpack bundling: their Node built-in usage (stream, net, tls)
  // otherwise breaks the edge-runtime compile of instrumentation.ts in dev,
  // even though register() there guards nodejs-only code at runtime.
  serverExternalPackages: ["imapflow", "@zone-eu/mailsplit", "mailparser", "nodemailer", "pg"],
};

export default nextConfig;
