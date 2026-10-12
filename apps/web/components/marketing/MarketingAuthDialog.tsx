"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { CredentialsSignInForm } from "@/features/auth/CredentialsSignInForm";
import { RegisterForm } from "@/features/auth/RegisterForm";
import { ForgotPasswordForm } from "@/features/auth/ForgotPasswordForm";

export type MarketingAuthView = "sign-in" | "register" | "forgot-password";

type MarketingAuthDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const VIEW_COPY: Record<
  MarketingAuthView,
  { title: string; description: string }
> = {
  "sign-in": {
    title: "Σύνδεση στο Talos",
    description: "Συνδεθείτε για να διαχειριστείτε την επιχείρηση φιλοξενίας σας.",
  },
  register: {
    title: "Δημιουργία λογαριασμού Talos",
    description: "Εγγραφείτε για να ξεκινήσετε τη ρύθμιση της λειτουργίας φιλοξενίας σας.",
  },
  "forgot-password": {
    title: "Επαναφορά κωδικού Talos",
    description:
      "Ζητήστε σύνδεσμο επαναφοράς κωδικού εάν υπάρχει λογαριασμός για το email σας.",
  },
};

/**
 * Single marketing authentication dialog shell.
 * Internal views switch without URL/history changes or closing the dialog.
 */
export function MarketingAuthDialog({ open, onOpenChange }: MarketingAuthDialogProps) {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [view, setView] = useState<MarketingAuthView>("sign-in");
  const [viewKey, setViewKey] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const root = document.querySelector(".talos-marketing");
    setPortalContainer(root instanceof HTMLElement ? root : null);
  }, []);

  useEffect(() => {
    if (!open) {
      // Reset to Sign in after close so the next open starts clean.
      const timer = window.setTimeout(() => {
        setView("sign-in");
        setViewKey((k) => k + 1);
      }, 200);
      return () => window.clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const heading = contentRef.current?.querySelector<HTMLElement>("[data-auth-heading]");
    heading?.focus();
  }, [view, open, viewKey]);

  function switchView(next: MarketingAuthView) {
    setView(next);
    setViewKey((k) => k + 1);
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
  }

  const copy = VIEW_COPY[view];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal container={portalContainer ?? undefined}>
        <DialogPrimitive.Overlay className="talos-signin-overlay" />
        <DialogPrimitive.Content
          className="talos-signin-dialog"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
        >
          <div className="flex items-start justify-between gap-4">
            <DialogPrimitive.Title
              id={titleId}
              className="talos-display text-xl font-semibold tracking-tight text-[var(--talos-ink)]"
            >
              TALOS
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              type="button"
              className="talos-signin-close"
              aria-label="Κλείσιμο ταυτοποίησης"
            >
              <X className="h-4 w-4" aria-hidden />
            </DialogPrimitive.Close>
          </div>

          <DialogPrimitive.Description id={descriptionId} className="sr-only">
            {copy.description}
          </DialogPrimitive.Description>

          <div
            ref={contentRef}
            key={viewKey}
            className="talos-auth-view mt-6 max-h-[min(70vh,36rem)] overflow-y-auto overscroll-contain pr-0.5"
            data-auth-view={view}
          >
            {view === "sign-in" ? (
              <CredentialsSignInForm
                variant="marketing"
                onSuccess={() => onOpenChange(false)}
                onCreateAccount={() => switchView("register")}
                onForgotPassword={() => switchView("forgot-password")}
              />
            ) : null}
            {view === "register" ? (
              <RegisterForm
                variant="marketing"
                onBackToLogin={() => switchView("sign-in")}
              />
            ) : null}
            {view === "forgot-password" ? (
              <ForgotPasswordForm
                variant="marketing"
                onBackToLogin={() => switchView("sign-in")}
              />
            ) : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** @deprecated Prefer MarketingAuthDialog — kept as alias for interim imports. */
export const MarketingSignInDialog = MarketingAuthDialog;
