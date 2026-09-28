"use client";

import { useEffect, useState } from "react";
import { useTenant } from "@/hooks/use-tenant";
import { Button } from "@/components/ui/button";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
import { toastError, toastSuccess } from "@/lib/admin/toast";

/**
 * V1 Property Guest Messaging settings.
 * Active: Welcome Email → WhatsApp CTA (workerless).
 * Scheduled Arrival / proactive WA templates are future (worker-dependent).
 */
export function PropertyWhatsAppAutomationsPanel({
  propertyId,
}: {
  propertyId: string;
}) {
  const { tenantId } = useTenant();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [welcomeEmailEnabled, setWelcomeEmailEnabled] = useState(true);
  const [whatsappEnabled, setWhatsappEnabled] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/admin/v1/properties/${propertyId}/messaging/settings`,
          { headers: { "x-tenant-id": tenantId } },
        );
        const json = await res.json();
        if (res.ok && json.data) {
          setWelcomeEmailEnabled(json.data.welcomeEmailEnabled ?? true);
          setWhatsappEnabled(json.data.whatsappEnabled ?? true);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [tenantId, propertyId]);

  async function save() {
    if (!tenantId) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/v1/properties/${propertyId}/messaging/settings`,
        {
          method: "PUT",
          headers: {
            "x-tenant-id": tenantId,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            whatsappEnabled,
            welcomeEmailEnabled,
            // Keep future scheduled template fields disabled in V1 UX.
            welcomeEnabled: false,
            welcomeTemplateName: null,
            welcomeTemplateLanguage: "en",
            arrivalEnabled: false,
            arrivalTemplateName: null,
            arrivalTemplateLanguage: "en",
            arrivalTimingMode: "check_in_local_time",
            arrivalLocalTime: "09:00",
            arrivalOffsetDays: 0,
            arrivalOffsetHours: 0,
          }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Save failed");
      toastSuccess("Guest Messaging settings saved");
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Surface>
      <SurfaceHeader
        title="Guest Messaging"
        description="Welcome Email invites the guest to contact the central Talos WhatsApp number. AI replies only after the guest sends the first message (customer service window)."
      />
      {loading ? (
        <p className="p-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-4 p-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={welcomeEmailEnabled}
              onChange={(e) => setWelcomeEmailEnabled(e.target.checked)}
            />
            Welcome Email enabled
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={whatsappEnabled}
              onChange={(e) => setWhatsappEnabled(e.target.checked)}
            />
            WhatsApp messaging enabled for this property
          </label>
          <p className="text-xs text-muted-foreground">
            Scheduled Arrival and other proactive WhatsApp automations require
            the Production worker and are not part of active V1. Infrastructure
            is retained for a future phase.
          </p>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      )}
    </Surface>
  );
}
