"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { LeadSource } from "@hcp/domain";
import { GetStartedWizard } from "@/features/get-started/GetStartedWizard";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: LeadSource;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
};

/**
 * Large Get Started onboarding workspace overlay.
 * Reuses GetStartedWizard — does not nest another dialog for Create Account.
 */
export function GetStartedOverlay({
  open,
  onOpenChange,
  source,
  utmSource,
  utmMedium,
  utmCampaign,
}: Props) {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [instanceKey, setInstanceKey] = useState(0);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const root = document.querySelector(".talos-marketing");
    setPortalContainer(root instanceof HTMLElement ? root : null);
  }, []);

  useEffect(() => {
    if (open) {
      setInstanceKey((k) => k + 1);
    }
  }, [open, source]);

  const preselectManaged = source === "property_management";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal container={portalContainer ?? undefined}>
        <DialogPrimitive.Overlay className="talos-get-started-overlay" />
        <DialogPrimitive.Content
          className="talos-get-started-dialog"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          data-testid="get-started-overlay"
        >
          <div className="talos-get-started-dialog-header">
            <div>
              <DialogPrimitive.Title
                id={titleId}
                className="talos-display text-xl font-semibold tracking-tight text-[var(--talos-ink)] sm:text-2xl"
              >
                Ξεκινήστε
              </DialogPrimitive.Title>
              <DialogPrimitive.Description
                id={descriptionId}
                className="mt-1 text-sm text-[var(--talos-muted)]"
              >
                Πείτε στο Talos για την επιχείρηση φιλοξενίας σας — μόνο αξιολόγηση, όχι
                δημιουργία λογαριασμού.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              type="button"
              className="talos-signin-close"
              aria-label="Κλείσιμο έναρξης"
              data-testid="get-started-overlay-close"
            >
              <X className="h-4 w-4" aria-hidden />
            </DialogPrimitive.Close>
          </div>

          <div className="talos-get-started-dialog-body">
            <aside className="talos-get-started-aside">
              <p className="talos-kicker">Αξιολόγηση</p>
              <p className="talos-display mt-3 text-2xl font-semibold tracking-tight">
                Πείτε μας για την επιχείρηση φιλοξενίας σας.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--talos-muted)]">
                Χωρίς κωδικούς ή διαπιστευτήρια καναλιών. Δεν δημιουργείται Χρήστης ή Οργανισμός από
                αυτή τη φόρμα.
              </p>
            </aside>
            <div className="talos-get-started-wizard-pane">
              <GetStartedWizard
                key={instanceKey}
                source={source}
                utmSource={utmSource}
                utmMedium={utmMedium}
                utmCampaign={utmCampaign}
                preselectManaged={preselectManaged}
                presentation="overlay"
                onRequestClose={() => onOpenChange(false)}
              />
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
