import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  serverExternalPackages: ["pdf-lib"],
  webpack: (config, { nextRuntime }) => {
    if (nextRuntime === "edge") {
      config.resolve.alias["@/analysis/video/supervisor"] = path.join(process.cwd(), "src/analysis/video/supervisor-stub.ts");
    }
    return config;
  },
  async redirects() {
    return [
      { source: "/measure", destination: "/record", permanent: false },
      { source: "/walk", destination: "/record", permanent: false },
      { source: "/contents", destination: "/results", permanent: false },
      { source: "/claims", destination: "/estimate", permanent: false },
      { source: "/underwriting", destination: "/estimate?report=underwriting", permanent: false },
    ];
  },
};

export default nextConfig;
