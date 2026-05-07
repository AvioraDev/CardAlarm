import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent Webpack from bundling native C++ addons — they must load at runtime
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
