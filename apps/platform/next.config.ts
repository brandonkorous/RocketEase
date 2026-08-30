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

/*
 * Never bundle the Azure SDK. `generateBlobSASQueryParameters` authorises by
 * `credential instanceof StorageSharedKeyCredential`, so two bundled copies of
 * the package make a credential built by one fail the other's check — every
 * upload dies with "Invalid sharedKeyCredential, userDelegationKey or
 * accountName" while perfectly valid credentials sit in the environment.
 * Webpack produced exactly two copies. Externalising keeps one class identity.
 * Unlike NODE_ONLY these are NOT aliased away on edge; nothing there imports them.
 */
const NEVER_BUNDLE = ["@azure/storage-blob"];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  transpilePackages: ["@rocketease/ui", "@rocketease/providers", "@rocketease/media"],
  serverExternalPackages: [...NODE_ONLY, ...NEVER_BUNDLE],
  webpack(config, { nextRuntime }) {
    if (nextRuntime !== "nodejs") {
      config.resolve.alias = { ...config.resolve.alias, ...Object.fromEntries(NODE_ONLY.map((p) => [p, false])) };
    }
    return config;
  },
};

export default nextConfig;
