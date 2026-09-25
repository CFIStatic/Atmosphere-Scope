import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  serverExternalPackages: ["pdf-lib"],
  async redirects() {
    return [
      { source: "/measure", destination: "/walk", permanent: false },
      { source: "/contents", destination: "/results", permanent: false },
      { source: "/claims", destination: "/estimate", permanent: false },
      { source: "/underwriting", destination: "/estimate?report=underwriting", permanent: false },
    ];
  },
};

export default nextConfig;
