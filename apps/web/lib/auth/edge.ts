import NextAuth from "next-auth";
import { edgeAuthConfig } from "@/lib/auth/auth.config";

/**
 * Edge-safe Auth.js instance for middleware session reads only.
 * Deliberately uses edgeAuthConfig (no Prisma / bcrypt / adapters).
 */
const edgeAuth = NextAuth(edgeAuthConfig);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const auth = edgeAuth.auth as (...args: any[]) => Promise<any>;
