"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTenant } from "@/hooks/use-tenant";
import {
  renderActivePropertyGate,
  useActiveProperty,
} from "@/hooks/use-active-property";
import { adminFetch, fetchPropertyUnitCatalog, flattenCatalogUnits, previewQuoteForStay } from "@/lib/admin/api";
import type { QuoteRecord, RatePlanRecord } from "@/lib/admin/types";
import { formatMoney, formatRatePlanForDisplay, moneyFieldLabel, nightsBetween, normalizeRatePlanForSubmit, parseApiValidationError } from "@/lib/admin/utils";
import { toastError, toastSuccess } from "@/lib/admin/toast";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
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

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const defaultRatePlan: RatePlanRecord = {
  baseNightlyAmount: "100.0000",
  currency: "EUR",
  seasons: [],
  dowModifiers: [],
  losDiscounts: [],
};

export function PricingPage() {
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const {
    propertyId,
    properties: activeProperties,
    ready: propertyReady,
    error: propertyError,
  } = useActiveProperty();
  const [allUnits, setAllUnits] = useState<
    Array<{ id: string; name: string; status: string; propertyId: string; propertyName: string }>
  >([]);
  const [unitId, setUnitId] = useState("");
  const [plan, setPlan] = useState<RatePlanRecord>(defaultRatePlan);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<QuoteRecord | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewForm, setPreviewForm] = useState({
    checkIn: "",
    checkOut: "",
    guestCount: 2,
  });

  const units = useMemo(
    () => allUnits.filter((u) => u.propertyId === propertyId),
    [allUnits, propertyId],
  );

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    void fetchPropertyUnitCatalog(tenantId)
      .then((catalog) => {
        setAllUnits(flattenCatalogUnits(catalog));
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load units");
        setLoading(false);
      });
  }, [tenantId]);

  useEffect(() => {
    if (!propertyId) {
      setUnitId("");
      return;
    }
    const scoped = allUnits.filter((u) => u.propertyId === propertyId);
    if (scoped.length === 0) {
      setUnitId("");
      setLoading(false);
      return;
    }
    setUnitId((current) =>
      scoped.some((u) => u.id === current) ? current : scoped[0]!.id,
    );
  }, [propertyId, allUnits]);

  useEffect(() => {
    if (!tenantId || !unitId) return;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await adminFetch<RatePlanRecord | null>(`/units/${unitId}/rate-plan`, { tenantId: tenantId! });
        setPlan(formatRatePlanForDisplay(data ?? defaultRatePlan));
        setFieldErrors({});
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load rate plan");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [tenantId, unitId]);

  async function save() {
    if (!tenantId || !unitId) return;

    const { payload, errors } = normalizeRatePlanForSubmit(plan);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const msg = "Please fix the highlighted amount fields before saving.";
      setError(msg);
      toastError(msg);
      return;
    }

    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      const saved = await adminFetch<RatePlanRecord>(`/units/${unitId}/rate-plan`, {
        method: "PUT",
        tenantId,
        body: JSON.stringify(payload),
      });
      setPlan(formatRatePlanForDisplay(saved));
      toastSuccess("Rate plan saved");
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Failed to save";
      const { message, fields } = parseApiValidationError(raw);
      setError(message);
      if (fields.length > 0) {
        setFieldErrors(Object.fromEntries(fields.map((field) => [field, message])));
      }
      toastError(message);
    } finally {
      setSaving(false);
    }
  }

  function moneyInputClass(fieldKey: string) {
    return cn(fieldErrors[fieldKey] && "border-destructive focus-visible:ring-destructive");
  }

  async function runPreview() {
    if (!tenantId || !unitId || !previewForm.checkIn || !previewForm.checkOut) return;
    setPreviewLoading(true);
    setPreview(null);
    try {
      const quote = await previewQuoteForStay(
        tenantId,
        unitId,
        previewForm.checkIn,
        previewForm.checkOut,
        previewForm.guestCount,
      );
      setPreview(quote);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setPreviewLoading(false);
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

  if (loading && allUnits.length === 0) return <Skeleton className="h-96 w-full" />;

  if (units.length === 0) {
    return (
      <EmptyState
        title="No units available"
        description="Create a unit for the active property before configuring pricing."
        action={{ label: "Go to units", href: "/dashboard/units", onClick: () => {} }}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Pricing"
        description="Rate plans, seasons, and modifiers"
        actions={
          <Button onClick={() => void save()} disabled={saving || !unitId}>
            {saving ? "Saving..." : "Save rate plan"}
          </Button>
        }
      />

      <div className="mb-6">
        <Select value={unitId} onValueChange={setUnitId}>
          <SelectTrigger className="w-full sm:w-[280px]">
            <SelectValue placeholder="Select unit" />
          </SelectTrigger>
          <SelectContent>
            {units.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.propertyName} — {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">{error}</p>
          {Object.keys(fieldErrors).length > 0 && (
            <ul className="mt-2 list-inside list-disc text-sm text-destructive/90">
              {Object.entries(fieldErrors).map(([field, msg]) => (
                <li key={field}>{moneyFieldLabel(field)}: {msg}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Base rate</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Nightly amount</Label>
                <Input
                  value={plan.baseNightlyAmount}
                  onChange={(e) => {
                    setPlan({ ...plan, baseNightlyAmount: e.target.value });
                    if (fieldErrors.baseNightlyAmount) {
                      setFieldErrors((prev) => {
                        const next = { ...prev };
                        delete next.baseNightlyAmount;
                        return next;
                      });
                    }
                  }}
                  className={moneyInputClass("baseNightlyAmount")}
                  placeholder="120"
                  aria-invalid={Boolean(fieldErrors.baseNightlyAmount)}
                />
                {fieldErrors.baseNightlyAmount && (
                  <p className="text-xs text-destructive">{fieldErrors.baseNightlyAmount}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Input
                  maxLength={3}
                  value={plan.currency}
                  onChange={(e) => setPlan({ ...plan, currency: e.target.value.toUpperCase() })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Seasonal pricing</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setPlan({
                    ...plan,
                    seasons: [
                      ...plan.seasons,
                      { id: crypto.randomUUID(), name: "Season", startDate: "2025-06-01", endDate: "2025-08-31", nightlyAmount: plan.baseNightlyAmount },
                    ],
                  })
                }
              >
                <Plus className="h-4 w-4" />
                Add season
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {plan.seasons.map((season, index) => (
                <div key={season.id} className="grid gap-3 rounded-md border p-4 sm:grid-cols-5">
                  <Input value={season.name} onChange={(e) => {
                    const seasons = [...plan.seasons];
                    seasons[index] = { ...season, name: e.target.value };
                    setPlan({ ...plan, seasons });
                  }} placeholder="Name" />
                  <Input type="date" value={season.startDate} onChange={(e) => {
                    const seasons = [...plan.seasons];
                    seasons[index] = { ...season, startDate: e.target.value };
                    setPlan({ ...plan, seasons });
                  }} />
                  <Input type="date" value={season.endDate} onChange={(e) => {
                    const seasons = [...plan.seasons];
                    seasons[index] = { ...season, endDate: e.target.value };
                    setPlan({ ...plan, seasons });
                  }} />
                  <Input
                    value={season.nightlyAmount}
                    onChange={(e) => {
                      const seasons = [...plan.seasons];
                      seasons[index] = { ...season, nightlyAmount: e.target.value };
                      setPlan({ ...plan, seasons });
                      const key = `seasons.${index}.nightlyAmount`;
                      if (fieldErrors[key]) {
                        setFieldErrors((prev) => {
                          const next = { ...prev };
                          delete next[key];
                          return next;
                        });
                      }
                    }}
                    className={moneyInputClass(`seasons.${index}.nightlyAmount`)}
                    placeholder="Amount"
                    aria-invalid={Boolean(fieldErrors[`seasons.${index}.nightlyAmount`])}
                  />
                  <Button variant="ghost" size="icon" onClick={() => setPlan({ ...plan, seasons: plan.seasons.filter((_, i) => i !== index) })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {plan.seasons.length === 0 && <p className="text-sm text-muted-foreground">No seasonal rates configured.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Weekend / day-of-week modifiers</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setPlan({
                    ...plan,
                    dowModifiers: [...plan.dowModifiers, { dayOfWeek: 5, modifierType: "percent", modifierValue: "10.0000" }],
                  })
                }
              >
                <Plus className="h-4 w-4" />
                Add modifier
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {plan.dowModifiers.map((mod, index) => (
                <div key={index} className="grid gap-3 rounded-md border p-4 sm:grid-cols-4">
                  <Select
                    value={String(mod.dayOfWeek)}
                    onValueChange={(v) => {
                      const dowModifiers = [...plan.dowModifiers];
                      dowModifiers[index] = { ...mod, dayOfWeek: Number(v) };
                      setPlan({ ...plan, dowModifiers });
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DAYS.map((d, i) => (
                        <SelectItem key={d} value={String(i)}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={mod.modifierType}
                    onValueChange={(v: "fixed" | "percent") => {
                      const dowModifiers = [...plan.dowModifiers];
                      dowModifiers[index] = { ...mod, modifierType: v };
                      setPlan({ ...plan, dowModifiers });
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Fixed</SelectItem>
                      <SelectItem value="percent">Percent</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={mod.modifierValue}
                    onChange={(e) => {
                      const dowModifiers = [...plan.dowModifiers];
                      dowModifiers[index] = { ...mod, modifierValue: e.target.value };
                      setPlan({ ...plan, dowModifiers });
                      const key = `dowModifiers.${index}.modifierValue`;
                      if (fieldErrors[key]) {
                        setFieldErrors((prev) => {
                          const next = { ...prev };
                          delete next[key];
                          return next;
                        });
                      }
                    }}
                    className={moneyInputClass(`dowModifiers.${index}.modifierValue`)}
                    placeholder={mod.modifierType === "percent" ? "10" : "25"}
                    aria-invalid={Boolean(fieldErrors[`dowModifiers.${index}.modifierValue`])}
                  />
                  <Button variant="ghost" size="icon" onClick={() => setPlan({ ...plan, dowModifiers: plan.dowModifiers.filter((_, i) => i !== index) })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Length-of-stay discounts</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setPlan({
                    ...plan,
                    losDiscounts: [...plan.losDiscounts, { minNights: 7, percentOff: "10.0000" }],
                  })
                }
              >
                <Plus className="h-4 w-4" />
                Add discount
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {plan.losDiscounts.map((disc, index) => (
                <div key={index} className="grid gap-3 rounded-md border p-4 sm:grid-cols-3">
                  <Input type="number" min={2} value={disc.minNights} onChange={(e) => {
                    const losDiscounts = [...plan.losDiscounts];
                    losDiscounts[index] = { ...disc, minNights: Number(e.target.value) };
                    setPlan({ ...plan, losDiscounts });
                  }} placeholder="Min nights" />
                  <Input
                    value={disc.percentOff}
                    onChange={(e) => {
                      const losDiscounts = [...plan.losDiscounts];
                      losDiscounts[index] = { ...disc, percentOff: e.target.value };
                      setPlan({ ...plan, losDiscounts });
                      const key = `losDiscounts.${index}.percentOff`;
                      if (fieldErrors[key]) {
                        setFieldErrors((prev) => {
                          const next = { ...prev };
                          delete next[key];
                          return next;
                        });
                      }
                    }}
                    className={moneyInputClass(`losDiscounts.${index}.percentOff`)}
                    placeholder="Percent off"
                    aria-invalid={Boolean(fieldErrors[`losDiscounts.${index}.percentOff`])}
                  />
                  <Button variant="ghost" size="icon" onClick={() => setPlan({ ...plan, losDiscounts: plan.losDiscounts.filter((_, i) => i !== index) })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Preview calculation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Uses live hold → quote flow against the saved rate plan (creates a temporary hold).
              </p>
              <div className="grid gap-4 sm:grid-cols-4">
                <div className="space-y-2">
                  <Label>Check-in</Label>
                  <Input type="date" value={previewForm.checkIn} onChange={(e) => setPreviewForm({ ...previewForm, checkIn: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Check-out</Label>
                  <Input type="date" value={previewForm.checkOut} onChange={(e) => setPreviewForm({ ...previewForm, checkOut: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Guests</Label>
                  <Input type="number" min={1} value={previewForm.guestCount} onChange={(e) => setPreviewForm({ ...previewForm, guestCount: Number(e.target.value) })} />
                </div>
                <div className="flex items-end">
                  <Button onClick={() => void runPreview()} disabled={previewLoading}>
                    {previewLoading ? "Calculating..." : "Preview price"}
                  </Button>
                </div>
              </div>
              {preview && (
                <div className="rounded-md border p-4">
                  <p className="text-lg font-semibold">
                    {formatMoney(preview.totalAmount, preview.currency)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {nightsBetween(previewForm.checkIn, previewForm.checkOut)} nights · subtotal{" "}
                    {formatMoney(preview.subtotalAmount, preview.currency)}
                  </p>
                  {preview.lineItems.length > 0 && (
                    <div className="mt-3 max-h-32 overflow-y-auto text-xs">
                      {preview.lineItems.map((line) => (
                        <div key={line.date} className="flex justify-between border-b py-1 last:border-0">
                          <span>{line.date}</span>
                          <span>{formatMoney(line.adjustedAmount, line.currency)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
