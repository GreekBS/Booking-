import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("standalone auth routes share form components", () => {
  it("/login uses CredentialsSignInForm", () => {
    const source = readFileSync(
      path.join(process.cwd(), "app/(auth)/login/page.tsx"),
      "utf8",
    );
    expect(source).toContain('from "@/features/auth/CredentialsSignInForm"');
    expect(source).toContain("CredentialsSignInForm");
    expect(source).not.toContain('signIn("credentials"');
  });

  it("/register uses RegisterForm", () => {
    const source = readFileSync(
      path.join(process.cwd(), "app/(auth)/register/page.tsx"),
      "utf8",
    );
    expect(source).toContain('from "@/features/auth/RegisterForm"');
    expect(source).toContain("RegisterForm");
    expect(source).not.toContain("/api/auth/register");
  });

  it("/forgot-password uses ForgotPasswordForm", () => {
    const source = readFileSync(
      path.join(process.cwd(), "app/(auth)/forgot-password/page.tsx"),
      "utf8",
    );
    expect(source).toContain('from "@/features/auth/ForgotPasswordForm"');
    expect(source).toContain("ForgotPasswordForm");
    expect(source).not.toContain("/api/auth/password-reset");
  });
});
