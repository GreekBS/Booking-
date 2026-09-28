"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { renderTenantGate, useTenant } from "@/hooks/use-tenant";
import {
  getPropertyAssistantConfig,
  replacePropertyFaqs,
  upsertPropertyAssistantProfile,
  upsertPropertyGuestKnowledge,
} from "@/lib/admin/api";
import type {
  PropertyAssistantProfileRecord,
  PropertyFaqItemRecord,
  PropertyGuestKnowledgeRecord,
} from "@/lib/admin/types";
import { PageHeader } from "@/components/admin/page-header";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
import { ErrorState } from "@/components/admin/error-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toastError, toastSuccess } from "@/lib/admin/toast";

const KNOWLEDGE_FIELDS: Array<{
  key: keyof PropertyGuestKnowledgeRecord;
  label: string;
}> = [
  { key: "guestFacingSummary", label: "Σύνοψη για επισκέπτες" },
  { key: "wifiSsid", label: "Wi‑Fi SSID" },
  { key: "wifiPassword", label: "Κωδικός Wi‑Fi" },
  { key: "accessInstructions", label: "Οδηγίες πρόσβασης" },
  { key: "parkingInfo", label: "Πάρκινγκ" },
  { key: "directions", label: "Οδηγίες άφιξης" },
  { key: "earlyCheckInPolicy", label: "Early check-in" },
  { key: "lateCheckoutPolicy", label: "Late checkout" },
  { key: "houseRules", label: "Κανονισμοί" },
  { key: "petsPolicy", label: "Κατοικίδια" },
  { key: "smokingPolicy", label: "Κάπνισμα" },
  { key: "quietHours", label: "Ώρες ησυχίας" },
  { key: "poolInfo", label: "Πισίνα" },
  { key: "hvacInstructions", label: "Κλιματισμός / θέρμανση" },
  { key: "applianceNotes", label: "Συσκευές" },
  { key: "amenityNotes", label: "Παροχές (σημειώσεις)" },
  { key: "transportInfo", label: "Μεταφορές" },
  { key: "taxiInfo", label: "Ταξί" },
  { key: "beaches", label: "Παραλίες" },
  { key: "restaurants", label: "Εστιατόρια" },
  { key: "supermarkets", label: "Σούπερ μάρκετ" },
  { key: "recommendations", label: "Προτάσεις" },
  { key: "guestFacingPhone", label: "Τηλέφωνο επικοινωνίας" },
  { key: "guestFacingEmail", label: "Email επικοινωνίας" },
  { key: "emergencyContact", label: "Έκτακτη ανάγκη" },
];

interface PropertyAiAssistantPageProps {
  propertyId: string;
}

export function PropertyAiAssistantPage({
  propertyId,
}: PropertyAiAssistantPageProps) {
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<PropertyAssistantProfileRecord | null>(
    null,
  );
  const [knowledge, setKnowledge] = useState<
    Partial<PropertyGuestKnowledgeRecord>
  >({});
  const [faqs, setFaqs] = useState<
    Array<{ id?: string; question: string; answer: string; isActive: boolean }>
  >([]);

  async function load() {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const config = await getPropertyAssistantConfig(tenantId, propertyId);
      setProfile(config.profile);
      setKnowledge(config.knowledge ?? {});
      setFaqs(
        config.faqs.map((f: PropertyFaqItemRecord) => ({
          id: f.id,
          question: f.question,
          answer: f.answer,
          isActive: f.isActive,
        })),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Αποτυχία φόρτωσης ρυθμίσεων AI",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [tenantId, propertyId]);

  const tenantGate = renderTenantGate({
    loading: tenantLoading,
    error: tenantError,
    tenantId,
  });
  if (tenantGate) return tenantGate;
  if (loading) return <Skeleton className="h-96 w-full" />;
  if (error && !profile) {
    return <ErrorState message={error} onRetry={() => void load()} />;
  }
  if (!profile) {
    return <ErrorState message="Δεν βρέθηκε προφίλ βοηθού" />;
  }

  async function saveProfile(
    patch: Partial<PropertyAssistantProfileRecord>,
  ) {
    if (!tenantId) return;
    setSaving(true);
    try {
      const next = await upsertPropertyAssistantProfile(
        tenantId,
        propertyId,
        patch,
      );
      setProfile(next);
      toastSuccess("Το προφίλ αποθηκεύτηκε");
    } catch (err) {
      toastError(
        err instanceof Error ? err.message : "Αποτυχία αποθήκευσης προφίλ",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveKnowledge() {
    if (!tenantId) return;
    setSaving(true);
    try {
      const patch: Record<string, string | null> = {};
      for (const { key } of KNOWLEDGE_FIELDS) {
        const value = knowledge[key];
        if (typeof value === "string" || value === null) {
          patch[key] = value;
        }
      }
      const saved = await upsertPropertyGuestKnowledge(
        tenantId,
        propertyId,
        patch,
      );
      setKnowledge(saved);
      toastSuccess("Η γνώση αποθηκεύτηκε");
    } catch (err) {
      toastError(
        err instanceof Error ? err.message : "Αποτυχία αποθήκευσης γνώσης",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveFaqs() {
    if (!tenantId) return;
    setSaving(true);
    try {
      const result = await replacePropertyFaqs(
        tenantId,
        propertyId,
        faqs.map((f, i) => ({
          id: f.id,
          question: f.question,
          answer: f.answer,
          sortOrder: i,
          isActive: f.isActive,
        })),
      );
      setFaqs(
        result.data.map((f) => ({
          id: f.id,
          question: f.question,
          answer: f.answer,
          isActive: f.isActive,
        })),
      );
      toastSuccess("Τα FAQ αποθηκεύτηκαν");
    } catch (err) {
      toastError(
        err instanceof Error ? err.message : "Αποτυχία αποθήκευσης FAQ",
      );
    } finally {
      setSaving(false);
    }
  }

  const modeValue =
    !profile.enabled || profile.mode === "off"
      ? "off"
      : profile.mode === "autopilot"
        ? "autopilot"
        : "copilot";

  return (
    <div className="space-y-4">
      <PageHeader
        title="AI Guest Receptionist"
        description="Λειτουργία, ύφος και γνώση καταλύματος για τον βοηθό επισκεπτών."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/properties/${propertyId}`}>
              Πίσω στο κατάλυμα
            </Link>
          </Button>
        }
      />

      <Surface variant="panel" padding="md">
        <SurfaceHeader
          title="Λειτουργία"
          description="OFF · χωρίς AI · COPILOT · πρόταση · AUTOPILOT · αυτόματη αποστολή."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Κατάσταση</Label>
            <Select
              value={modeValue}
              onValueChange={(value) => {
                if (value === "off") {
                  void saveProfile({ enabled: false, mode: "off" });
                } else {
                  void saveProfile({
                    enabled: true,
                    mode: value as "copilot" | "autopilot",
                  });
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">OFF</SelectItem>
                <SelectItem value="copilot">COPILOT</SelectItem>
                <SelectItem value="autopilot">AUTOPILOT</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Προεπιλεγμένη γλώσσα</Label>
            <Input
              value={profile.defaultLocale}
              onChange={(e) =>
                setProfile({ ...profile, defaultLocale: e.target.value })
              }
              onBlur={() =>
                void saveProfile({ defaultLocale: profile.defaultLocale })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Τόνος</Label>
            <Select
              value={profile.tone}
              onValueChange={(tone) => void saveProfile({ tone })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="warm">Warm</SelectItem>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="friendly">Friendly</SelectItem>
                <SelectItem value="luxury">Luxury</SelectItem>
                <SelectItem value="concise">Concise</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Επισημότητα</Label>
            <Select
              value={profile.formality}
              onValueChange={(formality) => void saveProfile({ formality })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="informal">Informal</SelectItem>
                <SelectItem value="neutral">Neutral</SelectItem>
                <SelectItem value="formal">Formal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Emoji</Label>
            <Select
              value={profile.emojiPolicy}
              onValueChange={(emojiPolicy) => void saveProfile({ emojiPolicy })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="sparing">Sparing</SelectItem>
                <SelectItem value="allowed">Allowed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Μήκος απάντησης</Label>
            <Select
              value={profile.replyLength}
              onValueChange={(replyLength) => void saveProfile({ replyLength })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="short">Short</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <Label htmlFor="use-first-name">Όνομα επισκέπτη</Label>
            <input
              id="use-first-name"
              type="checkbox"
              className="h-4 w-4"
              checked={profile.useGuestFirstName}
              onChange={(e) =>
                void saveProfile({ useGuestFirstName: e.target.checked })
              }
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <Label htmlFor="prefer-lang">Γλώσσα επισκέπτη</Label>
            <input
              id="prefer-lang"
              type="checkbox"
              className="h-4 w-4"
              checked={profile.preferGuestLanguage}
              onChange={(e) =>
                void saveProfile({ preferGuestLanguage: e.target.checked })
              }
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Υπογραφή (sign-off)</Label>
            <Input
              value={profile.signOff ?? ""}
              onChange={(e) =>
                setProfile({ ...profile, signOff: e.target.value || null })
              }
              onBlur={() => void saveProfile({ signOff: profile.signOff })}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Σημειώσεις ύφους</Label>
            <Textarea
              rows={3}
              value={profile.customVoiceNotes ?? ""}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  customVoiceNotes: e.target.value || null,
                })
              }
              onBlur={() =>
                void saveProfile({
                  customVoiceNotes: profile.customVoiceNotes,
                })
              }
            />
          </div>
        </div>
      </Surface>

      <Surface variant="panel" padding="md">
        <SurfaceHeader
          title="Γνώση καταλύματος"
          description="Γεγονότα που μπορεί να χρησιμοποιήσει ο βοηθός (χωρίς επινόηση)."
          action={
            <Button size="sm" disabled={saving} onClick={() => void saveKnowledge()}>
              Αποθήκευση γνώσης
            </Button>
          }
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {KNOWLEDGE_FIELDS.map(({ key, label }) => (
            <div key={key} className="space-y-2">
              <Label>{label}</Label>
              <Textarea
                rows={key === "guestFacingSummary" || key === "houseRules" ? 3 : 2}
                value={
                  typeof knowledge[key] === "string"
                    ? (knowledge[key] as string)
                    : ""
                }
                onChange={(e) =>
                  setKnowledge((prev) => ({
                    ...prev,
                    [key]: e.target.value || null,
                  }))
                }
              />
            </div>
          ))}
        </div>
      </Surface>

      <Surface variant="panel" padding="md">
        <SurfaceHeader
          title="FAQ"
          description="Συχνές ερωτήσεις με αυθεντικές απαντήσεις."
          action={
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setFaqs((prev) => [
                    ...prev,
                    { question: "", answer: "", isActive: true },
                  ])
                }
              >
                Προσθήκη FAQ
              </Button>
              <Button size="sm" disabled={saving} onClick={() => void saveFaqs()}>
                Αποθήκευση FAQ
              </Button>
            </div>
          }
        />
        <div className="space-y-4">
          {faqs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Δεν υπάρχουν FAQ ακόμα.
            </p>
          ) : (
            faqs.map((faq, index) => (
              <div
                key={faq.id ?? `new-${index}`}
                className="space-y-2 rounded-md border border-border p-3"
              >
                <Input
                  placeholder="Ερώτηση"
                  value={faq.question}
                  onChange={(e) =>
                    setFaqs((prev) =>
                      prev.map((f, i) =>
                        i === index ? { ...f, question: e.target.value } : f,
                      ),
                    )
                  }
                />
                <Textarea
                  rows={3}
                  placeholder="Απάντηση"
                  value={faq.answer}
                  onChange={(e) =>
                    setFaqs((prev) =>
                      prev.map((f, i) =>
                        i === index ? { ...f, answer: e.target.value } : f,
                      ),
                    )
                  }
                />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={faq.isActive}
                      onChange={(e) =>
                        setFaqs((prev) =>
                          prev.map((f, i) =>
                            i === index
                              ? { ...f, isActive: e.target.checked }
                              : f,
                          ),
                        )
                      }
                    />
                    Ενεργό
                  </label>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setFaqs((prev) => prev.filter((_, i) => i !== index))
                    }
                  >
                    Διαγραφή
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Surface>
    </div>
  );
}
