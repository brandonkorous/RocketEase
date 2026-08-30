import type { NextConfig } from "next";

/** Node-only telemetry packages: never bundled, and stubbed out of the edge compile (middleware) entirely. */
const NODE_ONLY = [
  "@opentelemetry/sdk-node",
  "@opentelemetry/sdk-trace-node",
  "@opentelemetry/exporter-trace-otlp-http",
  "@opentelemetry/instrumentation-http",
  "@opentelemetry/instrumentation-pg",
  "@opentelemetry/instrumentation",
  "@opentelemetry/resources",
  "@grpc/grpc-js",
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  transpilePackages: ["@rocketease/ui", "@rocketease/providers", "@rocketease/media"],
  serverExternalPackages: NODE_ONLY,
  webpack(config, { nextRuntime }) {
    if (nextRuntime !== "nodejs") {
      config.resolve.alias = { ...config.resolve.alias, ...Object.fromEntries(NODE_ONLY.map((p) => [p, false])) };
    }
    return config;
  },
};

export default nextConfig;
