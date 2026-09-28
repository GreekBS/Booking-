"use client";

import { useEffect, useState } from "react";
import { useTenant } from "@/hooks/use-tenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
import { toastError, toastSuccess } from "@/lib/admin/toast";

export function PropertyWhatsAppAutomationsPanel({
  propertyId,
}: {
  propertyId: string;
}) {
  const { tenantId } = useTenant();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    whatsappEnabled: true,
    welcomeEnabled: false,
    welcomeTemplateName: "",
    welcomeTemplateLanguage: "en",
    arrivalEnabled: false,
    arrivalTemplateName: "",
    arrivalTemplateLanguage: "en",
    arrivalTimingMode: "check_in_local_time" as const,
    arrivalLocalTime: "09:00",
    arrivalOffsetDays: 0,
    arrivalOffsetHours: 0,
  });

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
          setForm({
            whatsappEnabled: json.data.whatsappEnabled ?? true,
            welcomeEnabled: json.data.welcomeEnabled ?? false,
            welcomeTemplateName: json.data.welcomeTemplateName ?? "",
            welcomeTemplateLanguage: json.data.welcomeTemplateLanguage ?? "en",
            arrivalEnabled: json.data.arrivalEnabled ?? false,
            arrivalTemplateName: json.data.arrivalTemplateName ?? "",
            arrivalTemplateLanguage: json.data.arrivalTemplateLanguage ?? "en",
            arrivalTimingMode:
              json.data.arrivalTimingMode ?? "check_in_local_time",
            arrivalLocalTime: json.data.arrivalLocalTime ?? "09:00",
            arrivalOffsetDays: json.data.arrivalOffsetDays ?? 0,
            arrivalOffsetHours: json.data.arrivalOffsetHours ?? 0,
          });
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
            ...form,
            welcomeTemplateName: form.welcomeTemplateName || null,
            arrivalTemplateName: form.arrivalTemplateName || null,
          }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Save failed");
      toastSuccess("WhatsApp automations saved");
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Surface>
      <SurfaceHeader
        title="WhatsApp automations"
        description="Welcome/Arrival use Meta-approved templates on the central Talos WhatsApp number. Free-form AI replies only inside the guest service window."
      />
      {loading ? (
        <p className="p-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-4 p-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.welcomeEnabled}
              onChange={(e) =>
                setForm((f) => ({ ...f, welcomeEnabled: e.target.checked }))
              }
            />
            Welcome message enabled
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label>Welcome template name</Label>
              <Input
                value={form.welcomeTemplateName}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    welcomeTemplateName: e.target.value,
                  }))
                }
                placeholder="talos_welcome_v1"
              />
            </div>
            <div>
              <Label>Welcome language</Label>
              <Input
                value={form.welcomeTemplateLanguage}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    welcomeTemplateLanguage: e.target.value,
                  }))
                }
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.arrivalEnabled}
              onChange={(e) =>
                setForm((f) => ({ ...f, arrivalEnabled: e.target.checked }))
              }
            />
            Arrival message enabled
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label>Arrival template name</Label>
              <Input
                value={form.arrivalTemplateName}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    arrivalTemplateName: e.target.value,
                  }))
                }
                placeholder="talos_arrival_v1"
              />
            </div>
            <div>
              <Label>Arrival local time (check-in day)</Label>
              <Input
                value={form.arrivalLocalTime}
                onChange={(e) =>
                  setForm((f) => ({ ...f, arrivalLocalTime: e.target.value }))
                }
                placeholder="09:00"
              />
            </div>
          </div>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save automations"}
          </Button>
        </div>
      )}
    </Surface>
  );
}
