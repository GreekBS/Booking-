import path from "node:path";
import dotenv from "dotenv";
import type { NextConfig } from "next";

// next dev runs from apps/web; load database env (AUTH_SECRET, DATABASE_URL, AUTH_URL)
const repoRoot = path.resolve(process.cwd(), "../..");
dotenv.config({ path: path.join(repoRoot, "packages", "database", ".env") });

const nextConfig: NextConfig = {
  transpilePackages: [
    "@hcp/domain",
    "@hcp/database",
    "@hcp/validators",
    "@hcp/permissions",
    "@hcp/storefront-sdk",
    "@hcp/widget-react",
    "@hcp/widget-embed",
  ],
};

export default nextConfig;
