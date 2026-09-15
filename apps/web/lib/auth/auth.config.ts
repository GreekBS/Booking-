import type { NextAuthConfig } from "next-auth";

/**
 * Edge-compatible Auth.js config for middleware.
 * Must not import bcrypt, Prisma, adapters, or other Node-only modules.
 * JWT/session callbacks stay here so middleware can read the same token claims.
 */
export const edgeAuthConfig: NextAuthConfig = {
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  // Providers are registered only in the Node auth config (options.ts).
  providers: [],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.sub = user.id;
        token.platformRole = user.platformRole ?? null;
      }

      if (trigger === "update" && session?.activeTenantId) {
        token.activeTenantId = session.activeTenantId;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.platformRole = token.platformRole ?? null;
        session.user.activeTenantId =
          (token.activeTenantId as string | null) ?? null;
      }
      return session;
    },
  },
};
