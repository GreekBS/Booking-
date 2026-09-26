"use client";

import { useEffect, useMemo, useState } from "react";
import { useTenant } from "@/hooks/use-tenant";
import {
  renderActivePropertyGate,
  useActiveProperty,
} from "@/hooks/use-active-property";
import {
  adminFetch,
  fetchAllProperties,
  invalidatePropertiesCache,
} from "@/lib/admin/api";
import type { AvailabilityRulesRecord, PropertyRecord } from "@/lib/admin/types";
import { toastError, toastSuccess } from "@/lib/admin/toast";
import { PageHeader } from "@/components/admin/page-header";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
import { EmptyState } from "@/components/admin/empty-state";
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
  const {
    propertyId,
    property: activeProperty,
    properties: activeProperties,
    ready: propertyReady,
    error: propertyError,
  } = useActiveProperty();

  const [propertyDetail, setPropertyDetail] = useState<PropertyRecord | null>(null);
  const [unitId, setUnitId] = useState("");
  const [rules, setRules] = useState<AvailabilityRulesRecord>(defaultRules);
  const [policyForm, setPolicyForm] = useState({
    checkInTime: "15:00",
    checkOutTime: "11:00",
    cancellationPolicyType: "moderate",
  });
  const [loading, setLoading] = useState(true);
  const [savingPolicies, setSavingPolicies] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const units = useMemo(() => {
    if (propertyDetail?.units?.length) return propertyDetail.units;
    return activeProperty?.units ?? [];
  }, [propertyDetail, activeProperty]);

  useEffect(() => {
    if (!tenantId || !propertyId) return;

    let cancelled = false;
    async function loadProperty() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchAllProperties(tenantId!, 1, 100);
        if (cancelled) return;
        const detail = res.data.find((p) => p.id === propertyId) ?? null;
        setPropertyDetail(detail);
        if (detail) {
          setPolicyForm({
            checkInTime: detail.policies.checkInTime,
            checkOutTime: detail.policies.checkOutTime,
            cancellationPolicyType: detail.policies.cancellationPolicyType,
          });
          const nextUnits = detail.units;
          setUnitId((current) =>
            nextUnits.some((u) => u.id === current)
              ? current
              : (nextUnits[0]?.id ?? ""),
          );
        } else {
          setPolicyForm({
            checkInTime: "15:00",
            checkOutTime: "11:00",
            cancellationPolicyType: "moderate",
          });
          setUnitId("");
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load property policies");
        setPropertyDetail(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadProperty();
    return () => {
      cancelled = true;
    };
  }, [tenantId, propertyId]);

  useEffect(() => {
    if (!tenantId || !unitId) {
      setRules(defaultRules);
      return;
    }
    async function loadRules() {
      try {
        const data = await adminFetch<AvailabilityRulesRecord>(
          `/units/${unitId}/availability-rules`,
          { tenantId: tenantId! },
        );
        setRules(data);
      } catch {
        setRules(defaultRules);
      }
    }
    void loadRules();
  }, [tenantId, unitId]);

  async function savePropertyPolicies() {
    if (!tenantId || !propertyId) return;
    setSavingPolicies(true);
    setError(null);
    try {
      await adminFetch(`/properties/${propertyId}`, {
        method: "PATCH",
        tenantId,
        body: JSON.stringify({ policies: policyForm }),
      });
      invalidatePropertiesCache(tenantId);
      toastSuccess("Property policies saved");
      const res = await fetchAllProperties(tenantId, 1, 100);
      const detail = res.data.find((p) => p.id === propertyId) ?? null;
      setPropertyDetail(detail);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save";
      setError(message);
      toastError(message);
    } finally {
      setSavingPolicies(false);
    }
  }

  async function saveStayRules() {
    if (!tenantId || !unitId) return;
    setSavingRules(true);
    setError(null);
    try {
      await adminFetch(`/units/${unitId}/availability-rules`, {
        method: "PUT",
        tenantId,
        body: JSON.stringify(rules),
      });
      toastSuccess("Stay rules saved");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save stay rules";
      setError(message);
      toastError(message);
    } finally {
      setSavingRules(false);
    }
  }

  const propertyGate = renderActivePropertyGate({
    tenantLoading,
    tenantError,
    tenantId,
    propertyReady,
    propertyError,
    propertyId,
    properties: activeProperties,
  });
  if (propertyGate) return propertyGate;

  return (
    <div>
      <PageHeader
        title="Policies"
        description="Check-in/out and cancellation for the active property, plus unit stay rules under that property."
        meta={
          activeProperty?.name ? (
            <span className="text-xs text-muted-foreground">
              Active property ·{" "}
              <span className="font-medium text-foreground">{activeProperty.name}</span>
            </span>
          ) : null
        }
      />

      {error ? (
        <div className="mb-4">
          <ErrorState message={error} />
        </div>
      ) : null}

      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : !propertyDetail ? (
        <EmptyState
          title="Property not found"
          description="Could not load policies for the active property. Switch property in the header or try again."
        />
      ) : (
        <div className="space-y-5">
          <Surface>
            <SurfaceHeader
              title="Property policies"
              description="Applies to the active property. Change Active Property in the header to edit another property."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="policy-check-in">Check-in time</Label>
                <Input
                  id="policy-check-in"
                  value={policyForm.checkInTime}
                  onChange={(e) =>
                    setPolicyForm({ ...policyForm, checkInTime: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="policy-check-out">Check-out time</Label>
                <Input
                  id="policy-check-out"
                  value={policyForm.checkOutTime}
                  onChange={(e) =>
                    setPolicyForm({ ...policyForm, checkOutTime: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Cancellation policy</Label>
                <Select
                  value={policyForm.cancellationPolicyType}
                  onValueChange={(v) =>
                    setPolicyForm({ ...policyForm, cancellationPolicyType: v })
                  }
                >
                  <SelectTrigger aria-label="Cancellation policy">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flexible">Flexible</SelectItem>
                    <SelectItem value="moderate">Moderate</SelectItem>
                    <SelectItem value="strict">Strict</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-4">
              <Button
                disabled={savingPolicies}
                onClick={() => void savePropertyPolicies()}
              >
                {savingPolicies ? "Saving…" : "Save property policies"}
              </Button>
            </div>
          </Surface>

          <Surface>
            <SurfaceHeader
              title="Stay rules"
              description="Unit-scoped availability rules for units on the active property."
            />
            {units.length === 0 ? (
              <EmptyState
                compact
                title="No units"
                description="Add a unit on this property before configuring stay rules."
                action={{ label: "View units", href: "/dashboard/units" }}
              />
            ) : (
              <>
                <div className="mb-4 space-y-2">
                  <Label>Unit</Label>
                  <Select value={unitId} onValueChange={setUnitId}>
                    <SelectTrigger className="w-full sm:w-[280px]" aria-label="Select unit">
                      <SelectValue placeholder="Select unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="rules-min-nights">Minimum stay (nights)</Label>
                    <Input
                      id="rules-min-nights"
                      type="number"
                      min={1}
                      value={rules.minNights}
                      onChange={(e) =>
                        setRules({ ...rules, minNights: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rules-max-nights">Maximum stay (nights)</Label>
                    <Input
                      id="rules-max-nights"
                      type="number"
                      min={1}
                      value={rules.maxNights}
                      onChange={(e) =>
                        setRules({ ...rules, maxNights: Number(e.target.value) })
                      }
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <Button
                    disabled={savingRules || !unitId}
                    onClick={() => void saveStayRules()}
                  >
                    {savingRules ? "Saving…" : "Save stay rules"}
                  </Button>
                </div>
              </>
            )}
          </Surface>
        </div>
      )}
    </div>
  );
}
