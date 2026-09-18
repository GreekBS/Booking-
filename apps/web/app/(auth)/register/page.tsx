"use client";

import { RegisterForm } from "@/features/auth/RegisterForm";

/**
 * Standalone `/register` — same registration implementation as the marketing modal.
 */
export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <RegisterForm variant="admin" />
    </div>
  );
}
