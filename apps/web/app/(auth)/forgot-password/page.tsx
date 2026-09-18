"use client";

import { ForgotPasswordForm } from "@/features/auth/ForgotPasswordForm";

/**
 * Standalone `/forgot-password` — same reset-request implementation as the marketing modal.
 */
export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <ForgotPasswordForm variant="admin" />
    </div>
  );
}
