import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("auth route protection invariants (source)", () => {
  it("middleware still redirects unauthenticated users to /login", () => {
    const source = readFileSync(path.join(process.cwd(), "middleware.ts"), "utf8");
    expect(source).toContain("buildLoginUrl");
    expect(source).toContain('pathname.startsWith("/login")');
    expect(source).toContain('pathname.startsWith("/platform")');
  });

  it("dashboard layout still gates with requireSession", () => {
    const source = readFileSync(
      path.join(process.cwd(), "app/(dashboard)/layout.tsx"),
      "utf8",
    );
    expect(source).toContain("requireSession");
    expect(source).toContain('redirect("/login")');
    expect(source).toContain("shouldRedirectSuperAdminToPlatform");
  });

  it("explicit logout redirects to the public homepage", () => {
    const adminHeader = readFileSync(
      path.join(process.cwd(), "components/admin/admin-header.tsx"),
      "utf8",
    );
    const signOutButton = readFileSync(
      path.join(process.cwd(), "features/auth/SignOutButton.tsx"),
      "utf8",
    );
    const platformHeader = readFileSync(
      path.join(process.cwd(), "components/platform/PlatformHeader.tsx"),
      "utf8",
    );
    expect(adminHeader).toContain('signOut({ callbackUrl: "/" })');
    expect(signOutButton).toContain('signOut({ callbackUrl: "/" })');
    expect(platformHeader).toContain('signOut({ callbackUrl: "/" })');
    expect(adminHeader).not.toContain('signOut({ callbackUrl: "/login" })');
    expect(signOutButton).not.toContain('signOut({ callbackUrl: "/login" })');
    expect(platformHeader).not.toContain('signOut({ callbackUrl: "/login" })');
  });
});
