import path from "node:path";
import dotenv from "dotenv";
import type { NextConfig } from "next";
import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";

// next dev runs from apps/web; load database env (AUTH_SECRET, DATABASE_URL, AUTH_URL)
const repoRoot = path.resolve(process.cwd(), "../..");
dotenv.config({ path: path.join(repoRoot, "packages", "database", ".env") });

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
    ],
  },
  transpilePackages: [
    "@hcp/domain",
    "@hcp/database",
    "@hcp/validators",
    "@hcp/permissions",
    "@hcp/storefront-sdk",
    "@hcp/widget-react",
    "@hcp/widget-embed",
  ],
  // Keep Prisma out of the server bundle so NFT can resolve engine binaries.
  serverExternalPackages: ["@prisma/client", "prisma"],
  // Official Prisma monorepo fix: copy Query Engine binaries into serverless output.
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.plugins = [...(config.plugins ?? []), new PrismaPlugin()];
    }
    return config;
  },
};

export default nextConfig;
