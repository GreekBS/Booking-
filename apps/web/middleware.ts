import { auth } from "@/lib/auth/config";
import { NextResponse } from "next/server";

export async function middleware(request: Request) {
  const requestId = crypto.randomUUID();
  const url = new URL(request.url);
  const isAuthPage =
    url.pathname.startsWith("/login") ||
    url.pathname.startsWith("/register") ||
    url.pathname.startsWith("/forgot-password") ||
    url.pathname.startsWith("/invite");
  const isDevPreview = url.pathname.startsWith("/dev");
  const isApiAuth =
    url.pathname.startsWith("/api/auth") &&
    !url.pathname.startsWith("/api/auth/register") &&
    !url.pathname.startsWith("/api/auth/password-reset") &&
    !url.pathname.startsWith("/api/auth/verify-email");
  const isPublicInvite =
    url.pathname.includes("/invitations/") &&
    url.pathname.includes("/accept");

  const attachRequestId = (response: NextResponse) => {
    response.headers.set("x-request-id", requestId);
    return response;
  };

  if (isApiAuth || isPublicInvite) {
    return attachRequestId(NextResponse.next());
  }

  const session = await auth();
  const isApi = url.pathname.startsWith("/api/");

  if (!session?.user && !isAuthPage && !isDevPreview && !url.pathname.startsWith("/api/auth/")) {
    if (isApi) {
      return attachRequestId(
        NextResponse.json(
          { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
          { status: 401 },
        ),
      );
    }
    return attachRequestId(NextResponse.redirect(new URL("/login", request.url)));
  }

  if (session?.user && isAuthPage) {
    const redirectUrl =
      session.user.platformRole === "super_admin"
        ? "/platform/tenants"
        : "/dashboard";
    return attachRequestId(NextResponse.redirect(new URL(redirectUrl, request.url)));
  }

  if (
    url.pathname.startsWith("/platform") &&
    session?.user?.platformRole !== "super_admin"
  ) {
    return attachRequestId(
      NextResponse.redirect(new URL("/dashboard", request.url)),
    );
  }

  const response = NextResponse.next();
  response.headers.set("x-request-id", requestId);
  if (session?.user) {
    response.headers.set("x-user-id", session.user.id);
    if (session.user.activeTenantId) {
      response.headers.set("x-tenant-id", session.user.activeTenantId);
    }
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
