"use client";

import { CredentialsSignInForm } from "@/features/auth/CredentialsSignInForm";

/**
 * Standalone `/login` fallback — same credentials implementation as the marketing modal.
 */
export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <CredentialsSignInForm variant="admin" />
    </div>
  );
}
