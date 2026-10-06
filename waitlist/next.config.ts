import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  poweredByHeader: false,
  turbopack: { root: path.resolve(__dirname) }, // this folder is its own project inside a bigger repo
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "X-Content-Type-Options", value: "nosniff" }, { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }, { key: "X-Frame-Options", value: "DENY" }] }];
  },
};
export default config;
