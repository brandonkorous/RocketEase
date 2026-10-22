import type { NextConfig } from "next";

/** WizeLens runs in the Node.js server only: never bundled, and stubbed out of the edge compile of instrumentation.ts. */
const NODE_ONLY = ["@wizeworks/lens-node"];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  transpilePackages: ["@rocketease/ui"],
  serverExternalPackages: NODE_ONLY,
  webpack(config, { nextRuntime }) {
    if (nextRuntime !== "nodejs") {
      config.resolve.alias = { ...config.resolve.alias, ...Object.fromEntries(NODE_ONLY.map((p) => [p, false])) };
    }
    return config;
  },
};

export default nextConfig;
