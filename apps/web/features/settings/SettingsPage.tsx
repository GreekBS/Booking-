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
import { ErrorState } from "@/components/admin/error-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { FiscalSettingsSection } from "./FiscalSettingsSection";

export function SettingsPage() {
  const { profile, tenantId, tenantName, loading: tenantLoading, error: tenantError } = useTenant();
  const membership = profile?.memberships.find((m) => m.tenantId === tenantId);

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
      <PageHeader title="Settings" description="Tenant configuration, commerce, and storefront keys" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tenant profile</CardTitle>
            <CardDescription>Read-only session context</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Tenant name</Label>
              <Input value={tenantName} readOnly />
            </div>
            <div className="space-y-2">
              <Label>Slug</Label>
              <Input value={membership?.tenantSlug ?? ""} readOnly />
            </div>
            <div className="space-y-2">
              <Label>Your role</Label>
              <Input value={membership?.role ?? ""} readOnly className="capitalize" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Regional settings</CardTitle>
            <CardDescription>Timezone, locale, currency, and display formats</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Input
                value={tenantSettings.timezone}
                onChange={(e) => setTenantSettings({ ...tenantSettings, timezone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Default locale</Label>
              <Input
                value={tenantSettings.defaultLocale}
                onChange={(e) => setTenantSettings({ ...tenantSettings, defaultLocale: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Default currency</Label>
              <Input
                value={tenantSettings.defaultCurrency}
                onChange={(e) => setTenantSettings({ ...tenantSettings, defaultCurrency: e.target.value.toUpperCase() })}
                maxLength={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Date format</Label>
              <Select
                value={tenantSettings.dateFormat}
                onValueChange={(value) =>
                  setTenantSettings({ ...tenantSettings, dateFormat: value })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                  <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                  <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Time format</Label>
              <Select
                value={tenantSettings.timeFormat}
                onValueChange={(value) =>
                  setTenantSettings({ ...tenantSettings, timeFormat: value })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">24-hour</SelectItem>
                  <SelectItem value="12h">12-hour</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button disabled={saving} onClick={() => void saveTenantSettings()}>
              Save regional settings
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Commerce settings</CardTitle>
            <CardDescription>Hold TTL, confirmation mode, and commerce currency</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
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
            <div className="space-y-2">
              <Label>Confirmation mode</Label>
              <Select
                value={commerceSettings.confirmationMode}
                onValueChange={(value) =>
                  setCommerceSettings({ ...commerceSettings, confirmationMode: value })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="payment_required">Payment required</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
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
          </CardContent>
        </Card>

        <FiscalSettingsSection />

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Storefront publishable keys</CardTitle>
            <CardDescription>Only publishable keys are shown — secret keys are never stored or returned</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={saving} onClick={() => void createKey("test")}>
                Create test key
              </Button>
              <Button variant="outline" disabled={saving} onClick={() => void createKey("live")}>
                Create live key
              </Button>
            </div>
            {newKeyValue && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950">
                <p className="font-medium">New key (copy now):</p>
                <code className="mt-1 block break-all font-mono">{newKeyValue}</code>
              </div>
            )}
            {keys.length === 0 ? (
              <p className="text-sm text-muted-foreground">No publishable keys yet.</p>
            ) : (
              keys.map((key) => (
                <KeyRow
                  key={key.id}
                  keyRecord={key}
                  saving={saving}
                  onRevoke={() => void revokeKey(key.id)}
                  onSaveDomains={(text) => void saveKeyDomains(key, text)}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>
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
    <div className="rounded-md border p-4 space-y-3">
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
        <div className="space-y-2">
          <Label>Allowed domains (comma-separated, * or *.example.com)</Label>
          <Input value={domains} onChange={(e) => setDomains(e.target.value)} />
          <Button size="sm" variant="outline" disabled={saving} onClick={() => onSaveDomains(domains)}>
            Update domains
          </Button>
        </div>
      )}
    </div>
  );
}
