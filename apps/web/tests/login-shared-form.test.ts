import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("standalone /login shares CredentialsSignInForm", () => {
  it("login page imports the shared form", () => {
    const source = readFileSync(
      path.join(process.cwd(), "app/(auth)/login/page.tsx"),
      "utf8",
    );
    expect(source).toContain('from "@/features/auth/CredentialsSignInForm"');
    expect(source).toContain("CredentialsSignInForm");
    expect(source).not.toContain('signIn("credentials"');
  });
});
