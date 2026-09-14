import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      platformRole: "super_admin" | null;
      activeTenantId: string | null;
    };
  }

  interface User {
    platformRole?: "super_admin" | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    platformRole?: "super_admin" | null;
    activeTenantId?: string | null;
  }
}
