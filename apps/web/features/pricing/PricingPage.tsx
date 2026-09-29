"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { useTenant } from "@/hooks/use-tenant";
import {
  renderActivePropertyGate,
  useActiveProperty,
} from "@/hooks/use-active-property";
import {
  adminFetch,
  fetchPropertyUnitCatalog,
  flattenCatalogUnits,
  previewQuoteForStay,
  type StayPricingPreview,
} from "@/lib/admin/api";
import type { RatePlanRecord } from "@/lib/admin/types";
import {
  formatMoney,
  formatRatePlanForDisplay,
  moneyFieldLabel,
  nightsBetween,
  normalizeRatePlanForSubmit,
  parseApiValidationError,
} from "@/lib/admin/utils";
import { toastError, toastSuccess } from "@/lib/admin/toast";
import { cn } from "@/lib/utils";
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

import { elCommon, elWeekdaysShort } from "@/lib/i18n";

const DAYS = [...elWeekdaysShort];

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
    property,
    properties: activeProperties,
    ready: propertyReady,
    error: propertyError,
  } = useActiveProperty();
  const [allUnits, setAllUnits] = useState<
    Array<{ id: string; name: string; status: string; propertyId: string; propertyName: string }>
  >([]);
  const [unitId, setUnitId] = useState("");
  const [plan, setPlan] = useState<RatePlanRecord>(defaultRatePlan);
  const [planPersisted, setPlanPersisted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<StayPricingPreview | null>(null);
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

  const selectedUnit = useMemo(
    () => units.find((u) => u.id === unitId) ?? null,
    [units, unitId],
  );

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    void fetchPropertyUnitCatalog(tenantId)
      .then((catalog) => {
        setAllUnits(flattenCatalogUnits(catalog));
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης μονάδων");
        setLoading(false);
      });
  }, [tenantId]);

  useEffect(() => {
    if (!propertyId) {
      setUnitId("");
      setPreview(null);
      return;
    }
    const scoped = allUnits.filter((u) => u.propertyId === propertyId);
    if (scoped.length === 0) {
      setUnitId("");
      setPreview(null);
      setLoading(false);
      return;
    }
    setUnitId((current) =>
      scoped.some((u) => u.id === current) ? current : scoped[0]!.id,
    );
    setPreview(null);
  }, [propertyId, allUnits]);

  useEffect(() => {
    if (!tenantId || !unitId) return;
    async function load() {
      setLoading(true);
      setError(null);
      setPreview(null);
      try {
        const data = await adminFetch<RatePlanRecord | null>(`/units/${unitId}/rate-plan`, {
          tenantId: tenantId!,
        });
        setPlanPersisted(data != null);
        setPlan(formatRatePlanForDisplay(data ?? defaultRatePlan));
        setFieldErrors({});
      } catch (err) {
        setError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης τιμοκαταλόγου");
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
      const msg = "Διορθώστε τα επισημασμένα πεδία ποσών πριν την αποθήκευση.";
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
      setPlanPersisted(true);
      toastSuccess("Ο τιμοκατάλογος αποθηκεύτηκε");
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

  function clearFieldError(key: string) {
    if (!fieldErrors[key]) return;
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
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
      toastError(err instanceof Error ? err.message : "Η προεπισκόπηση απέτυχε");
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
        title="Δεν υπάρχουν διαθέσιμες μονάδες"
        description="Δημιουργήστε μονάδα για το ενεργό κατάλυμα πριν τη ρύθμιση τιμών."
        action={{ label: "Μετάβαση στις μονάδες", href: "/dashboard/units", onClick: () => {} }}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Τιμές"
        description="Εμπορική τιμολόγηση διαμονής για το ενεργό κατάλυμα — τιμοκατάλογοι, εποχές και τροποποιητές."
        meta={
          property?.name ? (
            <span className="text-xs text-muted-foreground">
              Ενεργό κατάλυμα · <span className="font-medium text-foreground">{property.name}</span>
            </span>
          ) : null
        }
        actions={
          <Button onClick={() => void save()} disabled={saving || !unitId}>
            {saving ? "Αποθήκευση…" : "Αποθήκευση τιμοκαταλόγου"}
          </Button>
        }
      />

      {property?.status === "draft" ? (
        <Surface className="mb-5" padding="md" variant="panel">
          <SurfaceHeader
            title="Το κατάλυμα είναι Πρόχειρο"
            description="Μπορείτε να αποθηκεύσετε τιμοκατάλογο τώρα. Για διαθεσιμότητα και κρατήσεις, ενεργοποιήστε το κατάλυμα."
          />
          <Button variant="outline" asChild>
            <Link href={`/dashboard/properties/${property.id}`}>Ενεργοποίηση καταλύματος</Link>
          </Button>
        </Surface>
      ) : null}

      <Surface className="mb-5" padding="md">
        <SurfaceHeader
          title="Μονάδα"
          description="Η τιμολόγηση ρυθμίζεται ανά μονάδα. Το ενεργό κατάλυμα ορίζεται στην κεφαλίδα."
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <Select value={unitId} onValueChange={setUnitId}>
            <SelectTrigger className="w-full sm:w-[280px]" aria-label="Επιλογή μονάδας">
              <SelectValue placeholder="Επιλέξτε μονάδα" />
            </SelectTrigger>
            <SelectContent>
              {units.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedUnit ? (
            <p className="text-xs text-muted-foreground">
              Επεξεργασία <span className="font-medium text-foreground">{selectedUnit.name}</span>
            </p>
          ) : null}
        </div>
      </Surface>

      {error ? (
        <div className="mb-4">
          <ErrorState message={error} />
          {Object.keys(fieldErrors).length > 0 ? (
            <ul className="mt-2 list-inside list-disc text-sm text-destructive">
              {Object.entries(fieldErrors).map(([field, msg]) => (
                <li key={field}>
                  {moneyFieldLabel(field)}: {msg}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          <div className="space-y-5">
            <Surface>
              <SurfaceHeader
                title="Βασική τιμή"
                description="Προεπιλεγμένη νυχτερινή τιμή όταν δεν ισχύει εποχική τιμή."
              />
              {!planPersisted ? (
                <p className="mb-3 rounded-md border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs text-amber-950">
                  Δεν υπάρχει αποθηκευμένος τιμοκατάλογος για αυτή τη μονάδα. Οι τιμές παρακάτω είναι προεπιλογή πρόχειρου μέχρι την αποθήκευση — το ημερολόγιο θα δείχνει νυχτερινές τιμές μόνο μετά την αποθήκευση.
                </p>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pricing-base-amount">Νυχτερινό ποσό</Label>
                  <Input
                    id="pricing-base-amount"
                    value={plan.baseNightlyAmount}
                    onChange={(e) => {
                      setPlan({ ...plan, baseNightlyAmount: e.target.value });
                      clearFieldError("baseNightlyAmount");
                    }}
                    className={moneyInputClass("baseNightlyAmount")}
                    placeholder="120"
                    inputMode="decimal"
                    aria-invalid={Boolean(fieldErrors.baseNightlyAmount)}
                  />
                  {fieldErrors.baseNightlyAmount ? (
                    <p className="text-xs text-destructive">{fieldErrors.baseNightlyAmount}</p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pricing-currency">Νόμισμα</Label>
                  <Input
                    id="pricing-currency"
                    maxLength={3}
                    value={plan.currency}
                    onChange={(e) =>
                      setPlan({ ...plan, currency: e.target.value.toUpperCase() })
                    }
                  />
                </div>
              </div>
            </Surface>

            <Surface>
              <SurfaceHeader
                title="Εποχική τιμολόγηση"
                description="Νυχτερινές τιμές με εύρος ημερομηνιών που υπερισχύουν της βασικής."
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setPlan({
                        ...plan,
                        seasons: [
                          ...plan.seasons,
                          {
                            id: crypto.randomUUID(),
                            name: "Season",
                            startDate: "2025-06-01",
                            endDate: "2025-08-31",
                            nightlyAmount: plan.baseNightlyAmount,
                          },
                        ],
                      })
                    }
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Προσθήκη εποχής
                  </Button>
                }
              />
              {plan.seasons.length === 0 ? (
                <p className="text-sm text-muted-foreground">Δεν έχουν ρυθμιστεί εποχικές τιμές.</p>
              ) : (
                <div className="space-y-2">
                  <div className="hidden gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-[1fr_1fr_1fr_1fr_2.5rem]">
                    <span>Όνομα</span>
                    <span>Start</span>
                    <span>End</span>
                    <span>Nightly</span>
                    <span className="sr-only">Ενέργειες</span>
                  </div>
                  {plan.seasons.map((season, index) => (
                    <div
                      key={season.id}
                      className="grid gap-2 rounded-md border border-border/80 bg-surface-subtle/40 p-2 sm:grid-cols-[1fr_1fr_1fr_1fr_2.5rem] sm:items-center"
                    >
                      <Input
                        value={season.name}
                        onChange={(e) => {
                          const seasons = [...plan.seasons];
                          seasons[index] = { ...season, name: e.target.value };
                          setPlan({ ...plan, seasons });
                        }}
                        placeholder="Όνομα"
                        aria-label={`Season ${index + 1} name`}
                      />
                      <Input
                        type="date"
                        value={season.startDate}
                        onChange={(e) => {
                          const seasons = [...plan.seasons];
                          seasons[index] = { ...season, startDate: e.target.value };
                          setPlan({ ...plan, seasons });
                        }}
                        aria-label={`Season ${index + 1} start`}
                      />
                      <Input
                        type="date"
                        value={season.endDate}
                        onChange={(e) => {
                          const seasons = [...plan.seasons];
                          seasons[index] = { ...season, endDate: e.target.value };
                          setPlan({ ...plan, seasons });
                        }}
                        aria-label={`Season ${index + 1} end`}
                      />
                      <Input
                        value={season.nightlyAmount}
                        onChange={(e) => {
                          const seasons = [...plan.seasons];
                          seasons[index] = { ...season, nightlyAmount: e.target.value };
                          setPlan({ ...plan, seasons });
                          clearFieldError(`seasons.${index}.nightlyAmount`);
                        }}
                        className={moneyInputClass(`seasons.${index}.nightlyAmount`)}
                        placeholder="Ποσό"
                        inputMode="decimal"
                        aria-label={`Season ${index + 1} nightly amount`}
                        aria-invalid={Boolean(fieldErrors[`seasons.${index}.nightlyAmount`])}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        aria-label={`Remove season ${index + 1}`}
                        onClick={() =>
                          setPlan({
                            ...plan,
                            seasons: plan.seasons.filter((_, i) => i !== index),
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Surface>

            <Surface>
              <SurfaceHeader
                title="Προσαρμογές ανά ημέρα εβδομάδας"
                description="Σταθερές ή ποσοστιαίες τροποποιήσεις για συγκεκριμένες ημέρες."
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setPlan({
                        ...plan,
                        dowModifiers: [
                          ...plan.dowModifiers,
                          {
                            dayOfWeek: 5,
                            modifierType: "percent",
                            modifierValue: "10.0000",
                          },
                        ],
                      })
                    }
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Add
                  </Button>
                }
              />
              {plan.dowModifiers.length === 0 ? (
                <p className="text-sm text-muted-foreground">Δεν υπάρχουν τροποποιητές ανά ημέρα.</p>
              ) : (
                <div className="space-y-2">
                  {plan.dowModifiers.map((mod, index) => (
                    <div
                      key={index}
                      className="grid gap-2 rounded-md border border-border/80 bg-surface-subtle/40 p-2 sm:grid-cols-[1fr_1fr_1fr_2.5rem] sm:items-center"
                    >
                      <Select
                        value={String(mod.dayOfWeek)}
                        onValueChange={(v) => {
                          const dowModifiers = [...plan.dowModifiers];
                          dowModifiers[index] = { ...mod, dayOfWeek: Number(v) };
                          setPlan({ ...plan, dowModifiers });
                        }}
                      >
                        <SelectTrigger aria-label={`Modifier ${index + 1} weekday`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DAYS.map((d, i) => (
                            <SelectItem key={d} value={String(i)}>
                              {d}
                            </SelectItem>
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
                        <SelectTrigger aria-label={`Modifier ${index + 1} type`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fixed">Σταθερό</SelectItem>
                          <SelectItem value="percent">Ποσοστό</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        value={mod.modifierValue}
                        onChange={(e) => {
                          const dowModifiers = [...plan.dowModifiers];
                          dowModifiers[index] = { ...mod, modifierValue: e.target.value };
                          setPlan({ ...plan, dowModifiers });
                          clearFieldError(`dowModifiers.${index}.modifierValue`);
                        }}
                        className={moneyInputClass(`dowModifiers.${index}.modifierValue`)}
                        placeholder={mod.modifierType === "percent" ? "10" : "25"}
                        inputMode="decimal"
                        aria-label={`Modifier ${index + 1} value`}
                        aria-invalid={Boolean(
                          fieldErrors[`dowModifiers.${index}.modifierValue`],
                        )}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        aria-label={`Remove modifier ${index + 1}`}
                        onClick={() =>
                          setPlan({
                            ...plan,
                            dowModifiers: plan.dowModifiers.filter((_, i) => i !== index),
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Surface>

            <Surface>
              <SurfaceHeader
                title="Εκπτώσεις διάρκειας διαμονής"
                description="Έκπτωση ποσοστού όταν η διάρκεια διαμονής φτάνει τις ελάχιστες νύχτες."
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setPlan({
                        ...plan,
                        losDiscounts: [
                          ...plan.losDiscounts,
                          { minNights: 7, percentOff: "10.0000" },
                        ],
                      })
                    }
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Add
                  </Button>
                }
              />
              {plan.losDiscounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Δεν υπάρχουν εκπτώσεις διάρκειας διαμονής.</p>
              ) : (
                <div className="space-y-2">
                  {plan.losDiscounts.map((disc, index) => (
                    <div
                      key={index}
                      className="grid gap-2 rounded-md border border-border/80 bg-surface-subtle/40 p-2 sm:grid-cols-[1fr_1fr_2.5rem] sm:items-center"
                    >
                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Ελάχ. νύχτες
                        </Label>
                        <Input
                          type="number"
                          min={2}
                          value={disc.minNights}
                          onChange={(e) => {
                            const losDiscounts = [...plan.losDiscounts];
                            losDiscounts[index] = {
                              ...disc,
                              minNights: Number(e.target.value),
                            };
                            setPlan({ ...plan, losDiscounts });
                          }}
                          aria-label={`Discount ${index + 1} min nights`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Έκπτωση %
                        </Label>
                        <Input
                          value={disc.percentOff}
                          onChange={(e) => {
                            const losDiscounts = [...plan.losDiscounts];
                            losDiscounts[index] = {
                              ...disc,
                              percentOff: e.target.value,
                            };
                            setPlan({ ...plan, losDiscounts });
                            clearFieldError(`losDiscounts.${index}.percentOff`);
                          }}
                          className={moneyInputClass(`losDiscounts.${index}.percentOff`)}
                          placeholder="10"
                          inputMode="decimal"
                          aria-label={`Discount ${index + 1} percent off`}
                          aria-invalid={Boolean(
                            fieldErrors[`losDiscounts.${index}.percentOff`],
                          )}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 self-end"
                        aria-label={`Remove discount ${index + 1}`}
                        onClick={() =>
                          setPlan({
                            ...plan,
                            losDiscounts: plan.losDiscounts.filter((_, i) => i !== index),
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Surface>
          </div>

          <div className="space-y-5 xl:sticky xl:top-4 xl:self-start">
            <Surface variant="attention">
              <SurfaceHeader
                title="Προεπισκόπηση τιμής"
                description="Εκτίμηση μόνο για ανάγνωση από τον αποθηκευμένο τιμοκατάλογο. Δεν δημιουργεί δέσμευση, προσφορά ή μπλοκάρισμα αποθέματος."
              />
              <p className="mb-3 text-xs text-muted-foreground">
                Οι μη αποθηκευμένες αλλαγές δεν χρησιμοποιούνται — αποθηκεύστε πρώτα τον τιμοκατάλογο.
              </p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="preview-check-in">{elCommon.checkIn}</Label>
                  <Input
                    id="preview-check-in"
                    type="date"
                    value={previewForm.checkIn}
                    onChange={(e) =>
                      setPreviewForm({ ...previewForm, checkIn: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="preview-check-out">{elCommon.checkOut}</Label>
                  <Input
                    id="preview-check-out"
                    type="date"
                    value={previewForm.checkOut}
                    onChange={(e) =>
                      setPreviewForm({ ...previewForm, checkOut: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="preview-guests">{elCommon.guests}</Label>
                  <Input
                    id="preview-guests"
                    type="number"
                    min={1}
                    value={previewForm.guestCount}
                    onChange={(e) =>
                      setPreviewForm({
                        ...previewForm,
                        guestCount: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={() => void runPreview()}
                  disabled={previewLoading || !unitId}
                >
                  {previewLoading ? "Υπολογισμός…" : "Προεπισκόπηση τιμής"}
                </Button>
              </div>
              {preview ? (
                <div className="mt-4 rounded-md border border-border bg-surface p-3">
                  <p className="text-lg font-semibold tabular-nums">
                    {formatMoney(preview.totalAmount, preview.currency)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {nightsBetween(previewForm.checkIn, previewForm.checkOut)} νύχτες · καθαρή αξία {" "}
                    {formatMoney(preview.subtotalAmount, preview.currency)}
                  </p>
                  {preview.lineItems.length > 0 ? (
                    <div className="mt-3 max-h-40 overflow-y-auto text-xs">
                      {preview.lineItems.map((line) => (
                        <div
                          key={line.date}
                          className="flex justify-between border-b border-border/60 py-1 last:border-0"
                        >
                          <span>{line.date}</span>
                          <span className="tabular-nums">
                            {formatMoney(line.adjustedAmount, line.currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </Surface>
          </div>
        </div>
      )}
    </div>
  );
}
