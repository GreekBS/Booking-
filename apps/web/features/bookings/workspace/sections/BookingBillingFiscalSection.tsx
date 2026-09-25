"use client";

import { useCallback, useEffect, useState } from "react";
import { useTenant } from "@/hooks/use-tenant";
import { adminFetch } from "@/lib/admin/api";
import { toastError, toastSuccess } from "@/lib/admin/toast";
import {
  WorkspaceSection,
} from "@/features/workspace/components/WorkspaceSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BookingSectionProps } from "../types";

interface CustomerProfile {
  id: string;
  type: "INDIVIDUAL" | "BUSINESS";
  legalName: string;
  vatNumber: string | null;
  country: string;
  email: string | null;
  address: {
    line1: string;
    line2: string | null;
    city: string;
    region: string | null;
    postalCode: string;
    country: string;
  };
}

const emptyForm = {
  id: "" as string,
  type: "INDIVIDUAL" as "INDIVIDUAL" | "BUSINESS",
  legalName: "",
  vatNumber: "",
  country: "GR",
  email: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postalCode: "",
  addressCountry: "GR",
};

/**
 * Operator billing / fiscal identity for invoicing.
 * Reuses tenant CustomerBillingProfile (not Guest stay contact).
 * Issued FiscalDocuments keep immutable snapshots — edits here affect future docs only.
 */
export function BookingBillingFiscalSection(_props: BookingSectionProps) {
  void _props;
  const { tenantId } = useTenant();
  const [profiles, setProfiles] = useState<CustomerProfile[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const res = await adminFetch<{ profiles: CustomerProfile[] }>(
        "/fiscal/customer-profiles",
        { tenantId },
      );
      const list = res.profiles ?? [];
      setProfiles(list);
      setForm((current) => {
        if (current.id || list.length === 0) return current;
        const p = list[0]!;
        return {
          id: p.id,
          type: p.type,
          legalName: p.legalName,
          vatNumber: p.vatNumber ?? "",
          country: p.country,
          email: p.email ?? "",
          line1: p.address.line1,
          line2: p.address.line2 ?? "",
          city: p.address.city,
          region: p.address.region ?? "",
          postalCode: p.address.postalCode,
          addressCountry: p.address.country,
        };
      });
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Failed to load billing profiles");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  function selectProfile(id: string) {
    if (id === "__new__") {
      setForm({ ...emptyForm, country: "GR", addressCountry: "GR" });
      return;
    }
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    setForm({
      id: p.id,
      type: p.type,
      legalName: p.legalName,
      vatNumber: p.vatNumber ?? "",
      country: p.country,
      email: p.email ?? "",
      line1: p.address.line1,
      line2: p.address.line2 ?? "",
      city: p.address.city,
      region: p.address.region ?? "",
      postalCode: p.address.postalCode,
      addressCountry: p.address.country,
    });
  }

  async function save() {
    if (!tenantId || !form.legalName.trim()) return;
    setSaving(true);
    try {
      const body = {
        ...(form.id ? { id: form.id } : {}),
        type: form.type,
        legalName: form.legalName.trim(),
        vatNumber: form.vatNumber.trim() || null,
        country: form.country,
        email: form.email.trim() || null,
        address: {
          line1: form.line1.trim(),
          line2: form.line2.trim() || null,
          city: form.city.trim(),
          region: form.region.trim() || null,
          postalCode: form.postalCode.trim(),
          country: form.addressCountry,
        },
      };
      const saved = await adminFetch<CustomerProfile>("/fiscal/customer-profiles", {
        tenantId,
        method: "PUT",
        body: JSON.stringify(body),
      });
      toastSuccess("Billing / fiscal details saved");
      setForm({
        id: saved.id,
        type: saved.type,
        legalName: saved.legalName,
        vatNumber: saved.vatNumber ?? "",
        country: saved.country,
        email: saved.email ?? "",
        line1: saved.address.line1,
        line2: saved.address.line2 ?? "",
        city: saved.address.city,
        region: saved.address.region ?? "",
        postalCode: saved.address.postalCode,
        addressCountry: saved.address.country,
      });
      const res = await adminFetch<{ profiles: CustomerProfile[] }>(
        "/fiscal/customer-profiles",
        { tenantId },
      );
      setProfiles(res.profiles ?? []);
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <WorkspaceSection title="Billing / Fiscal Details">
      <p className="mb-3 text-xs text-muted-foreground">
        Customer identity used for invoices and receipts. Separate from stay guest
        contact. Issued documents keep a frozen snapshot.
      </p>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-4 max-w-xl">
          <div className="space-y-1.5">
            <Label>Saved profile</Label>
            <Select
              value={form.id || "__new__"}
              onValueChange={(v) => selectProfile(v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select or create" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__new__">New profile</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.legalName} ({p.type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Customer type</Label>
            <Select
              value={form.type}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  type: v as "INDIVIDUAL" | "BUSINESS",
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                <SelectItem value="BUSINESS">Business / Company</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>
              {form.type === "BUSINESS" ? "Legal / company name" : "Full / legal name"}
            </Label>
            <Input
              value={form.legalName}
              onChange={(e) => setForm((f) => ({ ...f, legalName: e.target.value }))}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>VAT / Tax ID (AFM)</Label>
              <Input
                value={form.vatNumber}
                onChange={(e) => setForm((f) => ({ ...f, vatNumber: e.target.value }))}
                placeholder={form.type === "BUSINESS" && form.country === "GR" ? "Required for GR business" : "Optional"}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Country</Label>
              <Input
                value={form.country}
                maxLength={2}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    country: e.target.value.toUpperCase(),
                    addressCountry: e.target.value.toUpperCase(),
                  }))
                }
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Address line 1</Label>
            <Input
              value={form.line1}
              onChange={(e) => setForm((f) => ({ ...f, line1: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Address line 2</Label>
            <Input
              value={form.line2}
              onChange={(e) => setForm((f) => ({ ...f, line2: e.target.value }))}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Region / state</Label>
              <Input
                value={form.region}
                onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Postal code</Label>
              <Input
                value={form.postalCode}
                onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            These details are used when issuing SERVICE_INVOICE / SERVICE_CREDIT.
            Retail receipts may use a minimal customer name. Changing a profile does
            not alter already issued documents.
          </p>

          <Button onClick={() => void save()} disabled={saving || !form.legalName.trim()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      )}
    </WorkspaceSection>
  );
}
