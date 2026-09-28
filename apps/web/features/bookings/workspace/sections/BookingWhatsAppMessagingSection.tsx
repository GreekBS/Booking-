"use client";

import { useEffect, useState } from "react";
import { useTenant } from "@/hooks/use-tenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  WorkspaceDetailList,
  WorkspaceDetailRow,
  WorkspaceSection,
} from "@/features/workspace/components/WorkspaceSection";
import { toastError, toastSuccess } from "@/lib/admin/toast";
import type { BookingSectionProps } from "../types";

type MessagingPayload = {
  profile: {
    whatsappPhone: string | null;
    messagingEnabled: boolean;
    identityStatus: string;
    conversationId: string | null;
    contactConfirmedAt: string | null;
    cswOpenUntil: string | null;
  } | null;
  automations: Array<{
    trigger: string;
    status: string;
    scheduledFor: string | null;
    occurrenceKey: string;
  }>;
};

export function BookingWhatsAppMessagingSection({
  booking,
}: BookingSectionProps) {
  const { tenantId } = useTenant();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<MessagingPayload | null>(null);
  const [phone, setPhone] = useState("");
  const [alsoCrm, setAlsoCrm] = useState(false);

  async function reload() {
    if (!tenantId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/v1/bookings/${booking.id}/messaging/whatsapp`,
        { headers: { "x-tenant-id": tenantId } },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Load failed");
      setData(json.data);
      setPhone(
        json.data?.profile?.whatsappPhone ??
          booking.guest.phone ??
          booking.linkedGuest?.phone ??
          "",
      );
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [tenantId, booking.id]);

  async function save() {
    if (!tenantId) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/v1/bookings/${booking.id}/messaging/whatsapp`,
        {
          method: "POST",
          headers: {
            "x-tenant-id": tenantId,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            whatsappPhone: phone,
            messagingEnabled: true,
            alsoUpdateGuestCrm: alsoCrm,
          }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Save failed");
      toastSuccess("WhatsApp messaging enabled for this booking");
      await reload();
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const welcome = data?.automations.find((a) => a.trigger === "welcome");
  const arrival = data?.automations.find((a) => a.trigger === "arrival");

  return (
    <WorkspaceSection title="WhatsApp messaging">
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Confirm the guest WhatsApp number for this stay. Prefills from the
            reservation contact or CRM Guest when available. Stay-only by
            default — does not invent country codes.
          </p>
          <div className="space-y-2">
            <Label htmlFor="wa-phone">WhatsApp phone (E.164)</Label>
            <Input
              id="wa-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+3069…"
            />
          </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={alsoCrm}
                onChange={(e) => setAlsoCrm(e.target.checked)}
              />
              Also update CRM Guest phone
            </label>
          <Button onClick={() => void save()} disabled={saving || !phone.trim()}>
            {saving ? "Saving…" : "Confirm & enable messaging"}
          </Button>
          <WorkspaceDetailList>
            <WorkspaceDetailRow
              label="Status"
              value={
                data?.profile?.messagingEnabled
                  ? `Enabled · ${data.profile.identityStatus}`
                  : "Not enabled"
              }
            />
            <WorkspaceDetailRow
              label="Conversation"
              value={data?.profile?.conversationId ?? "—"}
            />
            <WorkspaceDetailRow
              label="CSW open until"
              value={data?.profile?.cswOpenUntil ?? "—"}
            />
            <WorkspaceDetailRow
              label="Welcome"
              value={
                welcome
                  ? `${welcome.status}${welcome.scheduledFor ? ` · ${welcome.scheduledFor}` : ""}`
                  : "—"
              }
            />
            <WorkspaceDetailRow
              label="Arrival"
              value={
                arrival
                  ? `${arrival.status}${arrival.scheduledFor ? ` · ${arrival.scheduledFor}` : ""}`
                  : "—"
              }
            />
          </WorkspaceDetailList>
          {data?.profile?.conversationId ? (
            <Button variant="outline" size="sm" asChild>
              <a href="/dashboard/messages">Open Messages</a>
            </Button>
          ) : null}
        </div>
      )}
    </WorkspaceSection>
  );
}
