"use client";

import { useEffect, useState } from "react";
import { renderTenantGate, useTenant } from "@/hooks/use-tenant";
import { adminFetch, fetchAllProperties, invalidatePropertiesCache } from "@/lib/admin/api";
import type { AvailabilityRulesRecord, PropertyRecord } from "@/lib/admin/types";
import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/admin/error-state";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const defaultRules: AvailabilityRulesRecord = {
  minNights: 1,
  maxNights: 30,
  checkInDays: [0, 1, 2, 3, 4, 5, 6],
  checkOutDays: [0, 1, 2, 3, 4, 5, 6],
  advanceMinDays: 0,
  advanceMaxDays: 365,
  turnoverNights: 0,
};

export function PoliciesPage() {
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [rules, setRules] = useState<AvailabilityRulesRecord>(defaultRules);
  const [policyForm, setPolicyForm] = useState({
    checkInTime: "15:00",
    checkOutTime: "11:00",
    cancellationPolicyType: "moderate",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const property = properties.find((p) => p.id === propertyId);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    void fetchAllProperties(tenantId, 1, 100)
      .then((res) => {
        setProperties(res.data);
        if (res.data[0]) {
          setPropertyId(res.data[0].id);
          if (res.data[0].units[0]) setUnitId(res.data[0].units[0].id);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load properties");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [tenantId]);

  useEffect(() => {
    if (!property) return;
    setPolicyForm({
      checkInTime: property.policies.checkInTime,
      checkOutTime: property.policies.checkOutTime,
      cancellationPolicyType: property.policies.cancellationPolicyType,
    });
    if (property.units[0] && !property.units.find((u) => u.id === unitId)) {
      setUnitId(property.units[0].id);
    }
  }, [propertyId, properties]);

  useEffect(() => {
    if (!tenantId || !unitId) return;
    async function loadRules() {
      try {
        const data = await adminFetch<AvailabilityRulesRecord>(`/units/${unitId}/availability-rules`, {
          tenantId: tenantId!,
        });
        setRules(data);
      } catch {
        setRules(defaultRules);
      }
    }
    void loadRules();
  }, [tenantId, unitId]);

  async function savePropertyPolicies() {
    if (!tenantId || !propertyId) return;
    setSaving(true);
    setError(null);
    try {
      await adminFetch(`/properties/${propertyId}`, {
        method: "PATCH",
        tenantId,
        body: JSON.stringify({ policies: policyForm }),
      });
      invalidatePropertiesCache(tenantId);
      setMessage("Property policies saved");
      const res = await fetchAllProperties(tenantId, 1, 100);
      setProperties(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function saveStayRules() {
    if (!tenantId || !unitId) return;
    setSaving(true);
    setError(null);
    try {
      await adminFetch(`/units/${unitId}/availability-rules`, {
        method: "PUT",
        tenantId,
        body: JSON.stringify(rules),
      });
      setMessage("Stay rules saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save stay rules");
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

  return (
    <div>
      <PageHeader title="Policies" description="Check-in/out, cancellation and stay rules" />

      {message && <p className="mb-4 text-sm text-emerald-600">{message}</p>}
      {error && <div className="mb-4"><ErrorState message={error} /></div>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Property</Label>
          <Select value={propertyId} onValueChange={setPropertyId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Unit (stay rules)</Label>
          <Select value={unitId} onValueChange={setUnitId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(property?.units ?? []).map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Property policies</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Check-in time</Label>
              <Input value={policyForm.checkInTime} onChange={(e) => setPolicyForm({ ...policyForm, checkInTime: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Check-out time</Label>
              <Input value={policyForm.checkOutTime} onChange={(e) => setPolicyForm({ ...policyForm, checkOutTime: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Cancellation policy</Label>
              <Select
                value={policyForm.cancellationPolicyType}
                onValueChange={(v) => setPolicyForm({ ...policyForm, cancellationPolicyType: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="flexible">Flexible</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="strict">Strict</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button disabled={saving} onClick={() => void savePropertyPolicies()}>Save property policies</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Stay rules</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Minimum stay (nights)</Label>
                <Input type="number" min={1} value={rules.minNights} onChange={(e) => setRules({ ...rules, minNights: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Maximum stay (nights)</Label>
                <Input type="number" min={1} value={rules.maxNights} onChange={(e) => setRules({ ...rules, maxNights: Number(e.target.value) })} />
              </div>
            </div>
            <Button disabled={saving} onClick={() => void saveStayRules()}>Save stay rules</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
