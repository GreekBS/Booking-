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
import { elCommon } from "@/lib/i18n";
import type { BookingSectionProps } from "../types";

type MessagingPayload = {
  profile: {
    whatsappPhone: string | null;
    messagingEnabled: boolean;
    identityStatus: string;
    conversationId: string | null;
    contactConfirmedAt: string | null;
    cswOpenUntil: string | null;
    guestChannelIdentity?: string | null;
    welcomeEmailStatus?: string;
  } | null;
  welcomeEmail: {
    status: string;
    to: string | null;
    sentAt: string | null;
    lastError: string | null;
  } | null;
  whatsappConnected: boolean;
  automations: Array<{
    trigger: string;
    status: string;
    scheduledFor: string | null;
    occurrenceKey: string;
  }>;
};

function welcomeLabel(status: string | undefined): string {
  switch (status) {
    case "sent":
      return "Sent";
    case "failed":
      return "Failed";
    case "unavailable":
      return "Unavailable";
    case "pending":
      return "Pending";
    default:
      return "Not sent";
  }
}

export function BookingWhatsAppMessagingSection({
  booking,
}: BookingSectionProps) {
  const { tenantId } = useTenant();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [data, setData] = useState<MessagingPayload | null>(null);
  const [phone, setPhone] = useState("");
  const [alsoCrm, setAlsoCrm] = useState(false);

  const guestEmail =
    booking.guest.email?.trim() ||
    booking.linkedGuest?.email?.trim() ||
    "";

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

  async function sendWelcomeEmail(manualResend: boolean) {
    if (!tenantId) return;
    setEmailBusy(true);
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
            action: "send_welcome_email",
            manualResend,
          }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Email failed");
      toastSuccess(
        manualResend ? "Welcome Email resent" : "Welcome Email sent",
      );
      await reload();
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Email failed");
    } finally {
      setEmailBusy(false);
    }
  }

  async function saveWhatsAppFallback() {
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
            action: "enable_whatsapp",
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

  const emailStatus =
    data?.welcomeEmail?.status ?? data?.profile?.welcomeEmailStatus ?? "none";
  const alreadySent = emailStatus === "sent";

  return (
    <WorkspaceSection title={elCommon.guestMessaging}>
      {loading ? (
        <p className="text-sm text-muted-foreground">{elCommon.loading}</p>
      ) : (
        <div className="space-y-6">
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Κύρια ενεργοποίηση: Welcome Email με ασφαλή σύνδεσμο επικοινωνίας
              WhatsApp. Ο επισκέπτης στέλνει το πρώτο μήνυμα WhatsApp — χωρίς
              worker.
            </p>
            <WorkspaceDetailList>
              <WorkspaceDetailRow
                label="Email"
                value={guestEmail || "Δεν υπάρχει χρησιμοποιήσιμο email"}
              />
              <WorkspaceDetailRow
                label="Welcome Email"
                value={
                  welcomeLabel(emailStatus) +
                  (data?.welcomeEmail?.lastError
                    ? ` · ${data.welcomeEmail.lastError}`
                    : "")
                }
              />
              <WorkspaceDetailRow
                label="WhatsApp"
                value={
                  data?.whatsappConnected
                    ? `Συνδεδεμένο · ${data.profile?.guestChannelIdentity ?? data.profile?.whatsappPhone ?? ""}`
                    : "Μη συνδεδεμένο"
                }
              />
              <WorkspaceDetailRow
                label="Συνομιλία"
                value={data?.profile?.conversationId ?? "—"}
              />
            </WorkspaceDetailList>
            {!guestEmail ? (
              <p className="text-sm text-amber-700">
                Η αυτόματη ενεργοποίηση μέσω email δεν είναι διαθέσιμη — δεν
                υπάρχει χρησιμοποιήσιμο email επισκέπτη. Χρησιμοποιήστε την
                εναλλακτική WhatsApp παρακάτω.
              </p>
            ) : (
              <Button
                onClick={() => void sendWelcomeEmail(alreadySent)}
                disabled={emailBusy || booking.status === "cancelled"}
              >
                {emailBusy
                  ? "Αποστολή…"
                  : alreadySent
                    ? "Επανάληψη Welcome Email"
                    : "Αποστολή Welcome Email"}
              </Button>
            )}
            {data?.profile?.conversationId ? (
              <Button variant="outline" size="sm" asChild>
                <a href="/dashboard/messages">Άνοιγμα συνομιλίας</a>
              </Button>
            ) : null}
          </div>

          <div className="space-y-3 border-t pt-4">
            <p className="text-sm font-medium">Χειροκίνητη εναλλακτική WhatsApp</p>
            <p className="text-sm text-muted-foreground">
              Επιβεβαιώστε αριθμό WhatsApp σε μορφή E.164 για αυτή τη διαμονή
              όταν δεν υπάρχει ενεργοποίηση μέσω email. Μόνο για τη διαμονή από
              προεπιλογή.
            </p>
            <div className="space-y-2">
              <Label htmlFor="wa-phone">Τηλέφωνο WhatsApp (E.164)</Label>
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
              Ενημέρωση και του τηλεφώνου στο CRM Guest
            </label>
            <Button
              variant="secondary"
              onClick={() => void saveWhatsAppFallback()}
              disabled={saving || !phone.trim()}
            >
              {saving ? elCommon.saving : "Επιβεβαίωση & ενεργοποίηση μηνυμάτων"}
            </Button>
          </div>
        </div>
      )}
    </WorkspaceSection>
  );
}
