"use client";

import { useEffect, useState } from "react";
import { renderTenantGate, useTenant } from "@/hooks/use-tenant";
import {
  createPublishableKey,
  fetchCommerceSettings,
  fetchPublishableKeys,
  fetchTenantSettings,
  revokePublishableKey,
  updateCommerceSettings,
  updatePublishableKeyDomains,
  updateTenantSettings,
} from "@/lib/admin/api";
import { toastError, toastSuccess } from "@/lib/admin/toast";
import type {
  CommerceSettingsRecord,
  PublishableKeyRecord,
  TenantSettingsRecord,
} from "@/lib/admin/types";
import { PageHeader } from "@/components/admin/page-header";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
import { ErrorState } from "@/components/admin/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FiscalSettingsSection } from "./FiscalSettingsSection";

type SettingsSection =
  | "organization"
  | "regional"
  | "commerce"
  | "fiscal"
  | "storefront-keys";

const SECTION_TRIGGER_CLASS =
  "rounded-md px-3 py-1.5 text-xs data-[state=active]:bg-primary-subtle data-[state=active]:text-primary data-[state=active]:shadow-none";

export function SettingsPage() {
  const { profile, tenantId, tenantName, loading: tenantLoading, error: tenantError } = useTenant();
  const membership = profile?.memberships.find((m) => m.tenantId === tenantId);

  const [section, setSection] = useState<SettingsSection>("organization");
  const [tenantSettings, setTenantSettings] = useState<TenantSettingsRecord | null>(null);
  const [commerceSettings, setCommerceSettings] = useState<CommerceSettingsRecord | null>(null);
  const [keys, setKeys] = useState<PublishableKeyRecord[]>([]);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [tenant, commerce, keyList] = await Promise.all([
        fetchTenantSettings(tenantId),
        fetchCommerceSettings(tenantId),
        fetchPublishableKeys(tenantId),
      ]);
      setTenantSettings(tenant);
      setCommerceSettings(commerce);
      setKeys(keyList.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [tenantId]);

  async function saveTenantSettings() {
    if (!tenantId || !tenantSettings) return;
    setSaving(true);
    try {
      const updated = await updateTenantSettings(tenantId, tenantSettings);
      setTenantSettings(updated);
      toastSuccess("Regional settings saved");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveCommerceSettings() {
    if (!tenantId || !commerceSettings) return;
    setSaving(true);
    try {
      const updated = await updateCommerceSettings(tenantId, {
        defaultHoldTtlSeconds: commerceSettings.defaultHoldTtlSeconds,
        confirmationMode: commerceSettings.confirmationMode as "manual" | "payment_required",
        defaultCurrency: commerceSettings.defaultCurrency,
      });
      setCommerceSettings(updated);
      toastSuccess("Commerce settings saved");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function createKey(environment: "test" | "live") {
    if (!tenantId) return;
    setSaving(true);
    try {
      const created = await createPublishableKey(
        tenantId,
        environment,
        environment === "test" ? ["*"] : undefined,
      );
      setNewKeyValue(created.publishableKey);
      toastSuccess(`${environment} key created — copy it now, it won't be shown again`);
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Create key failed");
    } finally {
      setSaving(false);
    }
  }

  async function revokeKey(keyId: string) {
    if (!tenantId) return;
    setSaving(true);
    try {
      await revokePublishableKey(tenantId, keyId);
      toastSuccess("Key revoked");
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Revoke failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveKeyDomains(key: PublishableKeyRecord, domainsText: string) {
    if (!tenantId) return;
    const allowedDomains = domainsText
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
    setSaving(true);
    try {
      await updatePublishableKeyDomains(tenantId, key.id, allowedDomains);
      toastSuccess("Allowed domains updated");
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  const tenantGate = renderTenantGate({
    loading: tenantLoading,
    error: tenantError,
    tenantId,
  });
  if (tenantGate) return tenantGate;
  if (loading) return <Skeleton className="h-96 w-full" />;
  if (error) return <ErrorState message={error ?? "Error"} onRetry={() => void load()} />;
  if (!tenantSettings || !commerceSettings) {
    return <ErrorState message="Failed to load settings." onRetry={() => void load()} />;
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Organization, regional, commerce, fiscal, and storefront configuration"
      />

      <Tabs
        value={section}
        onValueChange={(value) => setSection(value as SettingsSection)}
        className="space-y-5"
      >
        <div className="border-b border-border">
          <TabsList className="h-9 w-full justify-start gap-1 overflow-x-auto bg-transparent p-0">
            <TabsTrigger value="organization" className={SECTION_TRIGGER_CLASS}>
              Organization
            </TabsTrigger>
            <TabsTrigger value="regional" className={SECTION_TRIGGER_CLASS}>
              Regional
            </TabsTrigger>
            <TabsTrigger value="commerce" className={SECTION_TRIGGER_CLASS}>
              Commerce
            </TabsTrigger>
            <TabsTrigger value="fiscal" className={SECTION_TRIGGER_CLASS}>
              Fiscal
            </TabsTrigger>
            <TabsTrigger value="storefront-keys" className={SECTION_TRIGGER_CLASS}>
              Storefront keys
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="organization" className="mt-0 focus-visible:outline-none">
          <Surface>
            <SurfaceHeader
              title="Tenant profile"
              description="Read-only session context for the active organization"
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Tenant name</Label>
                <Input value={tenantName} readOnly />
              </div>
              <div className="space-y-1.5">
                <Label>Slug</Label>
                <Input value={membership?.tenantSlug ?? ""} readOnly />
              </div>
              <div className="space-y-1.5">
                <Label>Your role</Label>
                <Input value={membership?.role ?? ""} readOnly className="capitalize" />
              </div>
            </div>
          </Surface>
        </TabsContent>

        <TabsContent value="regional" className="mt-0 focus-visible:outline-none">
          <Surface>
            <SurfaceHeader
              title="Regional settings"
              description="Timezone, locale, currency, and display formats"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Timezone</Label>
                <Input
                  value={tenantSettings.timezone}
                  onChange={(e) =>
                    setTenantSettings({ ...tenantSettings, timezone: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Default locale</Label>
                <Input
                  value={tenantSettings.defaultLocale}
                  onChange={(e) =>
                    setTenantSettings({ ...tenantSettings, defaultLocale: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Default currency</Label>
                <Input
                  value={tenantSettings.defaultCurrency}
                  onChange={(e) =>
                    setTenantSettings({
                      ...tenantSettings,
                      defaultCurrency: e.target.value.toUpperCase(),
                    })
                  }
                  maxLength={3}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Date format</Label>
                <Select
                  value={tenantSettings.dateFormat}
                  onValueChange={(value) =>
                    setTenantSettings({ ...tenantSettings, dateFormat: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                    <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                    <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Time format</Label>
                <Select
                  value={tenantSettings.timeFormat}
                  onValueChange={(value) =>
                    setTenantSettings({ ...tenantSettings, timeFormat: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">24-hour</SelectItem>
                    <SelectItem value="12h">12-hour</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Button disabled={saving} onClick={() => void saveTenantSettings()}>
                  Save regional settings
                </Button>
              </div>
            </div>
          </Surface>
        </TabsContent>

        <TabsContent value="commerce" className="mt-0 focus-visible:outline-none">
          <Surface>
            <SurfaceHeader
              title="Commerce settings"
              description="Hold TTL, confirmation mode, and commerce currency"
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Hold TTL (seconds)</Label>
                <Input
                  type="number"
                  value={commerceSettings.defaultHoldTtlSeconds}
                  onChange={(e) =>
                    setCommerceSettings({
                      ...commerceSettings,
                      defaultHoldTtlSeconds: Number.parseInt(e.target.value, 10) || 900,
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Confirmation mode</Label>
                <Select
                  value={commerceSettings.confirmationMode}
                  onValueChange={(value) =>
                    setCommerceSettings({ ...commerceSettings, confirmationMode: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="payment_required">Payment required</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Commerce currency</Label>
                <Input
                  value={commerceSettings.defaultCurrency}
                  onChange={(e) =>
                    setCommerceSettings({
                      ...commerceSettings,
                      defaultCurrency: e.target.value.toUpperCase(),
                    })
                  }
                  maxLength={3}
                />
              </div>
              <div className="sm:col-span-3">
                <Button disabled={saving} onClick={() => void saveCommerceSettings()}>
                  Save commerce settings
                </Button>
              </div>
            </div>
          </Surface>
        </TabsContent>

        <TabsContent value="fiscal" className="mt-0 space-y-5 focus-visible:outline-none">
          <FiscalSettingsSection />
        </TabsContent>

        <TabsContent value="storefront-keys" className="mt-0 focus-visible:outline-none">
          <Surface>
            <SurfaceHeader
              title="Storefront publishable keys"
              description="Only publishable keys are shown — secret keys are never stored or returned"
              action={
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={saving}
                    onClick={() => void createKey("test")}
                  >
                    Create test key
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={saving}
                    onClick={() => void createKey("live")}
                  >
                    Create live key
                  </Button>
                </div>
              }
            />
            {newKeyValue && (
              <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950">
                <p className="font-medium">New key (copy now):</p>
                <code className="mt-1 block break-all font-mono">{newKeyValue}</code>
              </div>
            )}
            {keys.length === 0 ? (
              <p className="text-sm text-muted-foreground">No publishable keys yet.</p>
            ) : (
              <div className="space-y-3">
                {keys.map((key) => (
                  <KeyRow
                    key={key.id}
                    keyRecord={key}
                    saving={saving}
                    onRevoke={() => void revokeKey(key.id)}
                    onSaveDomains={(text) => void saveKeyDomains(key, text)}
                  />
                ))}
              </div>
            )}
          </Surface>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KeyRow({
  keyRecord,
  saving,
  onRevoke,
  onSaveDomains,
}: {
  keyRecord: PublishableKeyRecord;
  saving: boolean;
  onRevoke: () => void;
  onSaveDomains: (text: string) => void;
}) {
  const [domains, setDomains] = useState(keyRecord.allowedDomains.join(", "));

  return (
    <Surface variant="subtle" padding="sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-sm">{keyRecord.keyPrefix}…</p>
          <p className="text-xs text-muted-foreground capitalize">
            {keyRecord.environment} · {keyRecord.isActive ? "active" : "revoked"}
          </p>
        </div>
        {keyRecord.isActive && (
          <Button variant="destructive" size="sm" disabled={saving} onClick={onRevoke}>
            Revoke
          </Button>
        )}
      </div>
      {keyRecord.isActive && (
        <div className="mt-3 space-y-2">
          <Label>Allowed domains (comma-separated, * or *.example.com)</Label>
          <Input value={domains} onChange={(e) => setDomains(e.target.value)} />
          <Button size="sm" variant="outline" disabled={saving} onClick={() => onSaveDomains(domains)}>
            Update domains
          </Button>
        </div>
      )}
    </Surface>
  );
}
