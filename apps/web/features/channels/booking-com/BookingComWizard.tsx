"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { renderTenantGate, useTenant } from "@/hooks/use-tenant";
import { useActiveProperty } from "@/hooks/use-active-property";
import { fetchAllProperties, fetchRatePlan } from "@/lib/admin/api";
import type { PropertyRecord } from "@/lib/admin/types";
import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/admin/error-state";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  activateChannelConnection,
  formatChannelApiError,
} from "../channel-api";
import {
  confirmBookingComInitialSync,
  discoverBookingComRemote,
  fetchBookingComOperatorView,
  formatBookingComApiError,
  previewBookingComInitialSync,
  upsertBookingComProductMapping,
  validateBookingComMappingsApi,
} from "./booking-com-api";
import { ContextualHelpLink } from "./ContextualHelpLink";
import { ScreenshotSlot } from "./ScreenshotSlot";
import {
  BOOKING_COM_WIZARD_STEPS,
  type BookingComInitialSyncPreviewResult,
  type BookingComOperatorView,
  type BookingComValidationResult,
  type BookingComWizardStepId,
} from "./types";
import { elCommon } from "@/lib/i18n";

type Props = { connectionId: string };

function horizonDefaults() {
  const from = new Date();
  const to = new Date();
  to.setUTCDate(to.getUTCDate() + 14);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function BookingComWizard({ connectionId }: Props) {
  const router = useRouter();
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const { propertyId: activePropertyId } = useActiveProperty();
  const [view, setView] = useState<BookingComOperatorView | null>(null);
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const [propertyId, setPropertyId] = useState("");
  const [hotelId, setHotelId] = useState("");
  const [hotelName, setHotelName] = useState<string | null>(null);
  const [remoteRooms, setRemoteRooms] = useState<
    Array<{ roomTypeId: string; name: string | null }>
  >([]);
  const [remoteRates, setRemoteRates] = useState<
    Array<{ ratePlanId: string; name: string | null }>
  >([]);
  const [roomDrafts, setRoomDrafts] = useState<Record<string, string>>({});
  const [rateDrafts, setRateDrafts] = useState<
    Record<string, { ratePlanId: string; remoteRateId: string }>
  >({});
  const [unitRatePlans, setUnitRatePlans] = useState<
    Record<string, { id: string; name: string } | null>
  >({});
  const [validation, setValidation] = useState<BookingComValidationResult | null>(
    null,
  );
  const [preview, setPreview] = useState<BookingComInitialSyncPreviewResult | null>(
    null,
  );
  const horizon = useMemo(() => horizonDefaults(), []);

  const step = BOOKING_COM_WIZARD_STEPS[stepIndex]!;

  const selectedProperty = properties.find((p) => p.id === propertyId);
  const units = selectedProperty?.units ?? [];

  // Default wizard property picker to global active property when empty (connection remains tenant-wide).
  useEffect(() => {
    if (propertyId) return;
    if (!activePropertyId) return;
    if (!properties.some((p) => p.id === activePropertyId)) return;
    setPropertyId(activePropertyId);
  }, [propertyId, activePropertyId, properties]);

  const catalogContext = useMemo(() => {
    const activeUnitIds = units.map((u) => u.id);
    const activeRatePlanIds = Object.values(unitRatePlans)
      .map((rp) => rp?.id)
      .filter((id): id is string => Boolean(id));
    const unitPropertyIds: Record<string, string> = {};
    for (const u of units) unitPropertyIds[u.id] = propertyId;
    return { activeUnitIds, activeRatePlanIds, unitPropertyIds };
  }, [units, unitRatePlans, propertyId]);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [operatorView, props] = await Promise.all([
        fetchBookingComOperatorView(tenantId, connectionId),
        fetchAllProperties(tenantId),
      ]);
      setView(operatorView);
      setProperties(props.data ?? []);
      const propMap = operatorView.mappings.find(
        (m) => m.kind === "property_hotel" && m.status === "active",
      );
      if (propMap?.propertyId) setPropertyId(propMap.propertyId);
      if (propMap?.externalHotelId || operatorView.setup?.hotelId) {
        setHotelId(propMap?.externalHotelId ?? operatorView.setup?.hotelId ?? "");
      }
      const rooms: Record<string, string> = {};
      for (const m of operatorView.mappings) {
        if (m.kind === "unit_room" && m.status === "active" && m.unitId) {
          rooms[m.unitId] = m.externalRoomTypeId ?? "";
        }
      }
      setRoomDrafts(rooms);
    } catch (err) {
      setError(formatBookingComApiError(err));
    } finally {
      setLoading(false);
    }
  }, [tenantId, connectionId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!tenantId || units.length === 0) return;
    let cancelled = false;
    void (async () => {
      const next: Record<string, { id: string; name: string } | null> = {};
      for (const unit of units) {
        try {
          const rp = await fetchRatePlan(tenantId, unit.id);
          next[unit.id] = rp
            ? { id: (rp as { id?: string }).id ?? `rp-${unit.id}`, name: unit.name }
            : { id: `rp-${unit.id}`, name: `${unit.name} rate` };
        } catch {
          next[unit.id] = { id: `rp-${unit.id}`, name: `${unit.name} rate` };
        }
      }
      if (!cancelled) setUnitRatePlans(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, units]);

  async function softRefresh() {
    if (!tenantId) return;
    const operatorView = await fetchBookingComOperatorView(tenantId, connectionId);
    setView(operatorView);
  }

  const tenantGate = renderTenantGate({
    loading: tenantLoading,
    error: tenantError,
    tenantId,
  });
  if (tenantGate) return tenantGate;
  if (loading) return <Skeleton className="h-96 w-full" />;
  if (error || !view) {
    return <ErrorState message={error ?? "Η ρύθμιση δεν είναι διαθέσιμη"} onRetry={() => void load()} />;
  }

  const partner = view.partnerAccess;
  const canGoNext = stepIndex < BOOKING_COM_WIZARD_STEPS.length - 1;
  const canGoBack = stepIndex > 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Σύνδεση Booking.com"
        description="Καθοδηγούμενη ρύθμιση — μπορείτε να φύγετε και να συνεχίσετε αργότερα."
        actions={
          <Button variant="outline" asChild>
            <Link href="/dashboard/channels">Πίσω στα κανάλια</Link>
          </Button>
        }
      />

      <nav aria-label="Πρόοδος ρύθμισης" className="overflow-x-auto">
        <ol className="flex min-w-max gap-2 pb-1">
          {BOOKING_COM_WIZARD_STEPS.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                className={`rounded-full px-3 py-1 text-xs ${
                  i === stepIndex
                    ? "bg-primary text-primary-foreground"
                    : i < stepIndex
                      ? "bg-muted text-foreground"
                      : "bg-muted/50 text-muted-foreground"
                }`}
                onClick={() => setStepIndex(i)}
                aria-current={i === stepIndex ? "step" : undefined}
              >
                {i + 1}. {s.title}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" role="status">
        {partner.operatorMessage}
      </p>

      {actionError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
          {actionError}
        </p>
      ) : null}
      {actionMessage ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">
          {actionMessage}
        </p>
      ) : null}

      <Surface>
        <SurfaceHeader
          title={`Βήμα ${stepIndex + 1}: ${step.title}`}
          action={
            <ContextualHelpLink
              anchor={step.helpAnchor}
              label="Βοήθεια για αυτό το βήμα"
            />
          }
        />
        <div className="space-y-4">
          {step.id === "before" ? (
            <BeforeStep />
          ) : null}
          {step.id === "connect" ? (
            <ConnectStep partnerMessage={partner.operatorMessage} live={partner.liveConnectivityAvailable} fixture={partner.fixtureTransportEnabled} />
          ) : null}
          {step.id === "property" ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="talos-property">Κατάλυμα Talos</Label>
                  <Select value={propertyId} onValueChange={setPropertyId}>
                    <SelectTrigger id="talos-property" aria-label="Κατάλυμα αντιστοίχισης">
                      <SelectValue placeholder="Επιλέξτε κατάλυμα για αντιστοίχιση" />
                    </SelectTrigger>
                    <SelectContent>
                      {properties.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hotel-id">Hotel ID Booking.com</Label>
                  <Input
                    id="hotel-id"
                    value={hotelId}
                    onChange={(e) => setHotelId(e.target.value)}
                    placeholder="π.χ. 8135188"
                  />
                </div>
              </div>
              {hotelName ? (
                <p className="text-sm text-muted-foreground">
                  Απομακρυσμένο ξενοδοχείο: <span className="font-medium text-foreground">{hotelName}</span>
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={busy || !hotelId.trim()}
                  onClick={() =>
                    void (async () => {
                      setBusy(true);
                      setActionError(null);
                      try {
                        const discovered = await discoverBookingComRemote(
                          tenantId!,
                          connectionId,
                          hotelId.trim(),
                        );
                        if (!discovered.available) {
                          setActionMessage(
                            discovered.message ?? partner.operatorMessage,
                          );
                          setRemoteRooms([]);
                          setRemoteRates([]);
                        } else {
                          setHotelName(discovered.discovery?.hotel?.name ?? null);
                          setRemoteRooms(discovered.discovery?.rooms ?? []);
                          setRemoteRates(discovered.discovery?.ratePlans ?? []);
                          setActionMessage(
                            discovered.discovery?.hotel
                              ? "Βρέθηκε απομακρυσμένο κατάλυμα."
                              : "Δεν βρέθηκε ξενοδοχείο για αυτό το ID.",
                          );
                        }
                      } catch (err) {
                        setActionError(formatBookingComApiError(err));
                      } finally {
                        setBusy(false);
                      }
                    })()
                  }
                >
                  Αναζήτηση καταλύματος
                </Button>
                <Button
                  disabled={busy || !propertyId || !hotelId.trim()}
                  onClick={() =>
                    void (async () => {
                      setBusy(true);
                      setActionError(null);
                      try {
                        await upsertBookingComProductMapping(tenantId!, connectionId, {
                          kind: "property_hotel",
                          propertyId,
                          externalHotelId: hotelId.trim(),
                          mappingId: view.mappings.find(
                            (m) => m.kind === "property_hotel" && m.status === "active",
                          )?.mappingId,
                        });
                        await softRefresh();
                        setActionMessage("Η αντιστοίχιση καταλύματος αποθηκεύτηκε.");
                      } catch (err) {
                        setActionError(formatBookingComApiError(err));
                      } finally {
                        setBusy(false);
                      }
                    })()
                  }
                >
                  Αποθήκευση property match
                </Button>
              </div>
            </div>
          ) : null}

          {step.id === "rooms" ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Αντιστοιχίστε κάθε δωμάτιο Talos με έναν τύπο δωματίου Booking.com. Κύρια ετικέτα: όνομα·
                Τα IDs παραμένουν δευτερεύοντα.
              </p>
              <div className="space-y-3">
                {units.length === 0 ? (
                  <p className="text-sm text-amber-800">Επιλέξτε πρώτα κατάλυμα με μονάδες.</p>
                ) : (
                  units.map((unit) => (
                    <div
                      key={unit.id}
                      className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center"
                    >
                      <div>
                        <p className="font-medium">{unit.name}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">{unit.id}</p>
                        <StatusBadge
                          status={roomDrafts[unit.id] ? "active" : "draft"}
                          label={roomDrafts[unit.id] ? "Αντιστοιχισμένο" : "Μη αντιστοιχισμένο"}
                        />
                      </div>
                      <span className="hidden text-center text-muted-foreground sm:block" aria-hidden>
                        ↔
                      </span>
                      <div className="space-y-1">
                        <Label className="sr-only" htmlFor={`room-${unit.id}`}>
                          Δωμάτιο Booking.com για {unit.name}
                        </Label>
                        {remoteRooms.length > 0 ? (
                          <Select
                            value={roomDrafts[unit.id] ?? ""}
                            onValueChange={(v) =>
                              setRoomDrafts((prev) => ({ ...prev, [unit.id]: v }))
                            }
                          >
                            <SelectTrigger id={`room-${unit.id}`}>
                              <SelectValue placeholder="Επιλέξτε τύπο δωματίου" />
                            </SelectTrigger>
                            <SelectContent>
                              {remoteRooms.map((r) => (
                                <SelectItem key={r.roomTypeId} value={r.roomTypeId}>
                                  {r.name ?? r.roomTypeId}
                                  <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                                    {r.roomTypeId}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            id={`room-${unit.id}`}
                            value={roomDrafts[unit.id] ?? ""}
                            onChange={(e) =>
                              setRoomDrafts((prev) => ({
                                ...prev,
                                [unit.id]: e.target.value,
                              }))
                            }
                            placeholder="ID τύπου δωματίου Booking.com"
                          />
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <Button
                disabled={busy || !propertyId || !hotelId}
                onClick={() =>
                  void (async () => {
                    setBusy(true);
                    setActionError(null);
                    try {
                      for (const unit of units) {
                        const remote = roomDrafts[unit.id]?.trim();
                        if (!remote) continue;
                        const existing = view.mappings.find(
                          (m) =>
                            m.kind === "unit_room" &&
                            m.status === "active" &&
                            m.unitId === unit.id,
                        );
                        await upsertBookingComProductMapping(tenantId!, connectionId, {
                          mappingId: existing?.mappingId,
                          kind: "unit_room",
                          propertyId,
                          unitId: unit.id,
                          externalHotelId: hotelId.trim(),
                          externalRoomTypeId: remote,
                        });
                      }
                      await softRefresh();
                      setActionMessage("Οι αντιστοιχίσεις δωματίων αποθηκεύτηκαν.");
                    } catch (err) {
                      setActionError(formatBookingComApiError(err));
                    } finally {
                      setBusy(false);
                    }
                  })()
                }
              >
                Αποθήκευση room mappings
              </Button>
              <ContextualHelpLink anchor="map-rooms" label="Πώς λειτουργεί η αντιστοίχιση δωματίων" />
            </div>
          ) : null}

          {step.id === "rates" ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Η V1 υποστηρίζει μόνο Standard τιμολόγηση. Μη υποστηριζόμενα μοντέλα αποκλείονται στην επικύρωση.
              </p>
              {units.map((unit) => {
                const rp = unitRatePlans[unit.id];
                const roomTypeId = roomDrafts[unit.id];
                const draft = rateDrafts[unit.id] ?? {
                  ratePlanId: rp?.id ?? "",
                  remoteRateId: "",
                };
                return (
                  <div key={unit.id} className="space-y-2 rounded-md border p-3">
                    <p className="font-medium">
                      {unit.name}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        Τιμοκατάλογος: {rp?.name ?? "Standard"}
                      </span>
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label>Τιμοκατάλογος Booking.com</Label>
                        {remoteRates.length > 0 ? (
                          <Select
                            value={draft.remoteRateId}
                            onValueChange={(v) =>
                              setRateDrafts((prev) => ({
                                ...prev,
                                [unit.id]: {
                                  ratePlanId: rp?.id ?? `rp-${unit.id}`,
                                  remoteRateId: v,
                                },
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Επιλέξτε τιμοκατάλογο" />
                            </SelectTrigger>
                            <SelectContent>
                              {remoteRates.map((r) => (
                                <SelectItem key={r.ratePlanId} value={r.ratePlanId}>
                                  {r.name ?? r.ratePlanId}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            value={draft.remoteRateId}
                            onChange={(e) =>
                              setRateDrafts((prev) => ({
                                ...prev,
                                [unit.id]: {
                                  ratePlanId: rp?.id ?? `rp-${unit.id}`,
                                  remoteRateId: e.target.value,
                                },
                              }))
                            }
                            placeholder="ID τιμοκαταλόγου"
                          />
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-muted-foreground">Τύπος δωματίου (από βήμα 4)</Label>
                        <Input value={roomTypeId ?? ""} disabled readOnly />
                      </div>
                    </div>
                  </div>
                );
              })}
              <Button
                disabled={busy || !hotelId}
                onClick={() =>
                  void (async () => {
                    setBusy(true);
                    setActionError(null);
                    try {
                      for (const unit of units) {
                        const rp = unitRatePlans[unit.id];
                        const draft = rateDrafts[unit.id];
                        const roomTypeId = roomDrafts[unit.id];
                        if (!rp || !draft?.remoteRateId || !roomTypeId) continue;
                        const existingRate = view.mappings.find(
                          (m) =>
                            m.kind === "rate_plan" &&
                            m.status === "active" &&
                            m.ratePlanId === rp.id,
                        );
                        await upsertBookingComProductMapping(tenantId!, connectionId, {
                          mappingId: existingRate?.mappingId,
                          kind: "rate_plan",
                          unitId: unit.id,
                          ratePlanId: rp.id,
                          externalHotelId: hotelId.trim(),
                          externalRatePlanId: draft.remoteRateId.trim(),
                        });
                        const existingRr = view.mappings.find(
                          (m) =>
                            m.kind === "room_rate" &&
                            m.status === "active" &&
                            m.unitId === unit.id &&
                            m.ratePlanId === rp.id,
                        );
                        await upsertBookingComProductMapping(tenantId!, connectionId, {
                          mappingId: existingRr?.mappingId,
                          kind: "room_rate",
                          unitId: unit.id,
                          ratePlanId: rp.id,
                          externalHotelId: hotelId.trim(),
                          externalRoomTypeId: roomTypeId,
                          externalRatePlanId: draft.remoteRateId.trim(),
                        });
                      }
                      await softRefresh();
                      setActionMessage("Οι αντιστοιχίσεις τιμών/roomrate αποθηκεύτηκαν.");
                    } catch (err) {
                      setActionError(formatBookingComApiError(err));
                    } finally {
                      setBusy(false);
                    }
                  })()
                }
              >
                Αποθήκευση rate mappings
              </Button>
              <ContextualHelpLink anchor="map-rates" label="Πώς αντιστοιχίζονται οι τιμοκατάλογοι" />
            </div>
          ) : null}

          {step.id === "validate" ? (
            <div className="space-y-3">
              <Button
                disabled={busy}
                onClick={() =>
                  void (async () => {
                    setBusy(true);
                    setActionError(null);
                    try {
                      const result = await validateBookingComMappingsApi(
                        tenantId!,
                        connectionId,
                        {
                          expectedPropertyId: propertyId || null,
                          includeDiscovery: partner.fixtureTransportEnabled,
                          ...catalogContext,
                        },
                      );
                      setValidation(result);
                      setActionMessage(
                        result.ok
                          ? "Η επικύρωση πέρασε. Μπορείτε να συνεχίσετε στον συγχρονισμό."
                          : "Η επικύρωση βρήκε αποκλειστικά θέματα.",
                      );
                    } catch (err) {
                      setActionError(formatBookingComApiError(err));
                    } finally {
                      setBusy(false);
                    }
                  })()
                }
              >
                Εκτέλεση επικύρωσης
              </Button>
              {validation ? (
                <div className="space-y-2">
                  <StatusBadge
                    status={validation.ok ? "active" : "error"}
                    label={validation.ok ? "Έτοιμο" : "Αποκλεισμένο"}
                  />
                  {validation.blocking.map((issue) => (
                    <p
                      key={`b-${issue.code}-${issue.mappingId ?? ""}`}
                      className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                    >
                      <span className="font-medium">{issue.code}</span> — {issue.message}
                    </p>
                  ))}
                  {validation.warnings.map((issue) => (
                    <p
                      key={`w-${issue.code}-${issue.mappingId ?? ""}`}
                      className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
                    >
                      <span className="font-medium">{issue.code}</span> — {issue.message}
                    </p>
                  ))}
                  {validation.ok && validation.blocking.length === 0 ? (
                    <p className="text-sm text-emerald-800">Όλοι οι απαιτούμενοι έλεγχοι πέρασαν.</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {step.id === "sync" ? (
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                Μετά την επιβεβαίωση, το Talos γίνεται πηγή για διαθεσιμότητα, Standard τιμές
                και περιορισμούς στο Booking.com.
              </p>
              <p>Οι κρατήσεις Booking.com συνεχίζουν να εισέρχονται στο Talos.</p>
              <p className="font-medium text-foreground">
                Το Talos δεν εισάγει τιμές Booking.com στους τιμοκαταλόγους Talos.
              </p>
              <ContextualHelpLink
                anchor="review-sync"
                label="Τι συμβαίνει στον πρώτο συγχρονισμό;"
              />
            </div>
          ) : null}

          {step.id === "preview" ? (
            <div className="space-y-3">
              {!partner.fixtureTransportEnabled && !partner.liveConnectivityAvailable ? (
                <p className="rounded-md border px-3 py-2 text-sm" role="status">
                  Η προεπισκόπηση αρχικού συγχρονισμού απαιτεί ενεργοποίηση συνεργάτη Booking.com (ή
                  τοπικό fixture transport). {partner.operatorMessage}
                </p>
              ) : (
                <Button
                  disabled={busy || (validation != null && !validation.ok)}
                  onClick={() =>
                    void (async () => {
                      setBusy(true);
                      setActionError(null);
                      try {
                        const result = await previewBookingComInitialSync(
                          tenantId!,
                          connectionId,
                          {
                            ...horizon,
                            expectedPropertyId: propertyId || null,
                            ...catalogContext,
                          },
                        );
                        setPreview(result);
                        if (!result.available) {
                          setActionMessage(result.message ?? partner.operatorMessage);
                        } else {
                          setActionMessage("Η προεπισκόπηση είναι έτοιμη — ελέγξτε πριν την επιβεβαίωση.");
                        }
                      } catch (err) {
                        setActionError(formatBookingComApiError(err));
                      } finally {
                        setBusy(false);
                      }
                    })()
                  }
                >
                  Δημιουργία προεπισκόπησης συγχρονισμού
                </Button>
              )}
              {preview?.diff ? (
                <dl className="grid gap-2 rounded-md border p-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Χρονικός ορίζοντας</dt>
                    <dd>
                      {preview.diff.dateHorizonFrom} → {preview.diff.dateHorizonTo}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Δωμάτια</dt>
                    <dd>{preview.diff.roomsAffected}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Roomrates</dt>
                    <dd>{preview.diff.roomratesAffected}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Αλλαγές διαθεσιμότητας</dt>
                    <dd>{preview.diff.availabilityChanges}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Ανοίγματα / κλεισίματα</dt>
                    <dd>
                      {preview.diff.opens} / {preview.diff.closes}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Αλλαγές τιμών</dt>
                    <dd>{preview.diff.priceChanges}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Ελάχ. / μέγ. διαμονή</dt>
                    <dd>
                      {preview.diff.minStayChanges} / {preview.diff.maxStayChanges}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">CTA / CTD</dt>
                    <dd>
                      {preview.diff.ctaChanges} / {preview.diff.ctdChanges}
                    </dd>
                  </div>
                </dl>
              ) : null}
              {preview?.diff?.samples?.length ? (
                <details className="rounded-md border p-3 text-sm">
                  <summary className="cursor-pointer font-medium">Δείγματα πριν → μετά</summary>
                  <ul className="mt-2 space-y-1 font-mono text-[11px]">
                    {preview.diff.samples.slice(0, 8).map((s, i) => (
                      <li key={i}>
                        {String(s.date)} {String(s.field)}: {String(s.remote ?? "—")} →{" "}
                        {String(s.local ?? "—")}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ) : null}

          {step.id === "confirm" ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Η επιβεβαίωση χρησιμοποιεί token προεπισκόπησης. Αν άλλαξε η ρύθμιση Talos ή
                αντιστοίχισης, η παλιά επιβεβαίωση απορρίπτεται και πρέπει να δημιουργήσετε νέα
                προεπισκόπηση.
              </p>
              <Button
                disabled={
                  busy ||
                  !preview?.confirmationToken ||
                  preview.available === false
                }
                onClick={() =>
                  void (async () => {
                    setBusy(true);
                    setActionError(null);
                    try {
                      const result = await confirmBookingComInitialSync(
                        tenantId!,
                        connectionId,
                        {
                          confirmationToken: preview!.confirmationToken!,
                          mappingConfigGeneration: preview!.mappingConfigGeneration!,
                          talosStateFingerprint: preview!.talosStateFingerprint!,
                          remoteSnapshotFingerprint: preview!.remoteSnapshotFingerprint!,
                          from: horizon.from,
                          to: horizon.to,
                        },
                      );
                      if (!result.available) {
                        setActionMessage(result.message ?? partner.operatorMessage);
                      } else {
                        setActionMessage(
                          `Ο αρχικός συγχρονισμός έγινε αποδεκτός (στην ουρά: ${result.enqueued ?? 0}).`,
                        );
                        await softRefresh();
                      }
                    } catch (err) {
                      setActionError(formatBookingComApiError(err));
                      setPreview(null);
                    } finally {
                      setBusy(false);
                    }
                  })()
                }
              >
                Επιβεβαίωση συγχρονισμού
              </Button>
            </div>
          ) : null}

          {step.id === "activate" ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Η ενεργοποίηση απαιτεί έγκυρες αντιστοιχίσεις και επιβεβαιωμένο αρχικό συγχρονισμό.
                Το Talos δεν θα δείξει το Booking.com ως ζωντανό αν εκκρεμεί πρόσβαση συνεργάτη.
              </p>
              <Button
                disabled={busy || !view.setup?.initialSyncReady}
                onClick={() =>
                  void (async () => {
                    setBusy(true);
                    setActionError(null);
                    try {
                      await activateChannelConnection(
                        tenantId!,
                        connectionId,
                        view.connection.semanticConfigVersion,
                      );
                      setActionMessage("Η σύνδεση ενεργοποιήθηκε.");
                      router.push(`/dashboard/channels/${connectionId}`);
                    } catch (err) {
                      setActionError(formatChannelApiError(err));
                    } finally {
                      setBusy(false);
                    }
                  })()
                }
              >
                Ενεργοποίηση σύνδεσης
              </Button>
              {!view.setup?.initialSyncReady ? (
                <p className="text-xs text-muted-foreground">
                  Ολοκληρώστε την επιβεβαίωση προεπισκόπησης πριν την ενεργοποίηση.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </Surface>

      <div className="flex flex-wrap justify-between gap-2">
        <Button
          variant="outline"
          disabled={!canGoBack || busy}
          onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
        >
          {elCommon.back}
        </Button>
        <Button
          disabled={
            !canGoNext ||
            busy ||
            (step.id === "validate" && validation != null && !validation.ok)
          }
          onClick={() => setStepIndex((i) => Math.min(BOOKING_COM_WIZARD_STEPS.length - 1, i + 1))}
        >
          Συνέχεια
        </Button>
      </div>
    </div>
  );
}

function BeforeStep() {
  return (
    <div className="space-y-3 text-sm text-muted-foreground">
      <p>
        Αυτή η ενσωμάτωση συγχρονίζει <strong className="text-foreground">κρατήσεις</strong> από
        Booking.com στο Talos και στέλνει{" "}
        <strong className="text-foreground">διαθεσιμότητα</strong>,{" "}
        <strong className="text-foreground">τιμές</strong> και{" "}
        <strong className="text-foreground">περιορισμούς</strong> από Talos στο Booking.com.
      </p>
      <p>Χρειάζεστε κατάλυμα Talos με δωμάτια και Standard τιμές, καθώς και πρόσβαση στο Extranet του Booking.com.</p>
      <ScreenshotSlot id="BOOKING-HELP-01" />
    </div>
  );
}

function ConnectStep({
  partnerMessage,
  live,
  fixture,
}: {
  partnerMessage: string;
  live: boolean;
  fixture: boolean;
}) {
  return (
    <div className="space-y-3 text-sm text-muted-foreground">
      <ol className="list-decimal space-y-2 pl-5">
        <li>Ανοίξτε Booking.com Extranet → Λογαριασμός → Channel Manager.</li>
        <li>Επιλέξτε ή ζητήστε το Talos.</li>
        <li>Ζητήστε τύπους σύνδεσης: Reservations και Rates &amp; Availability.</li>
      </ol>
      {!live ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950" role="status">
          {partnerMessage}
          {fixture
            ? " Το τοπικό fixture transport επιτρέπει πρόβα ρύθμισης χωρίς ζωντανή σύνδεση Booking.com."
            : null}
        </p>
      ) : null}
      <ScreenshotSlot id="BOOKING-HELP-02" />
      <ScreenshotSlot id="BOOKING-HELP-03" />
    </div>
  );
}

// silence unused type import in some TS configs
void (null as unknown as BookingComWizardStepId);
