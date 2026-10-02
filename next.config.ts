import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@supabase/supabase-js"],
  // Reuse a screen's data for 30s when you come back to it, so tab switches feel instant.
  experimental: { staleTimes: { dynamic: 30, static: 180 } },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default config;
