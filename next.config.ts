import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack(config, { isServer, webpack }) {
    if (isServer && process.env.DAILY_PAPER_RUNTIME_TARGET === "cloudflare") {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /db[\\/]prisma[\\/]application-client$/,
          path.resolve(process.cwd(), "src/db/prisma/edge-application-client.ts")
        ),
        new webpack.NormalModuleReplacementPlugin(
          /prisma[\\/]application-json$/,
          path.resolve(process.cwd(), "src/db/prisma/edge-application-json.ts")
        )
      );
    }
    return config;
  }
};

export default nextConfig;
