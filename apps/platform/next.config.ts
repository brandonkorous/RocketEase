import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  transpilePackages: ["@make-it-social/ui", "@make-it-social/providers"],
};

export default nextConfig;
