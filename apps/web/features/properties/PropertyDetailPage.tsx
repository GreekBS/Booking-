"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { renderTenantGate, useTenant } from "@/hooks/use-tenant";
import { useActiveProperty } from "@/hooks/use-active-property";
import { adminFetch, invalidatePropertiesCache } from "@/lib/admin/api";
import type { AmenityRecord, PropertyRecord } from "@/lib/admin/types";
import { PageHeader } from "@/components/admin/page-header";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
import { ErrorState } from "@/components/admin/error-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { toastError, toastSuccess } from "@/lib/admin/toast";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { elCommon, displayUnitName, statusLabelEl } from "@/lib/i18n";
import { useBreadcrumbEntityLabels } from "@/components/admin/breadcrumb-entity-labels";

interface PropertyDetailPageProps {
  propertyId: string;
}

export function PropertyDetailPage({ propertyId }: PropertyDetailPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const onboarding = searchParams.get("onboarding") === "1";
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const { refresh: refreshActiveProperty, propertyId: activePropertyId } =
    useActiveProperty();
  const [property, setProperty] = useState<PropertyRecord | null>(null);
  const [amenities, setAmenities] = useState<AmenityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    type: "villa",
    status: "draft",
    timezone: "Europe/Athens",
    websiteUrl: "",
    addressLine: "",
    city: "",
    region: "",
    postalCode: "",
    country: "",
    checkInTime: "15:00",
    checkOutTime: "11:00",
    cancellationPolicyType: "moderate",
    amenityIds: [] as string[],
  });
  const [staffPin, setStaffPin] = useState("");
  const [staffPinConfirm, setStaffPinConfirm] = useState("");
  const [pinSaving, setPinSaving] = useState(false);

  async function loadProperty() {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [prop, amen] = await Promise.all([
        adminFetch<PropertyRecord>(`/properties/${propertyId}`, { tenantId }),
        adminFetch<{ data: AmenityRecord[] }>("/amenities", { tenantId }),
      ]);
      setProperty(prop);
      setAmenities(amen.data ?? []);
      setForm({
        name: prop.name,
        description: prop.description ?? "",
        type: prop.type,
        status: prop.status,
        timezone: prop.timezone,
        websiteUrl: prop.websiteUrl ?? "",
        addressLine: prop.location.addressLine ?? "",
        city: prop.location.city ?? "",
        region: prop.location.region ?? "",
        postalCode: prop.location.postalCode ?? "",
        country: prop.location.country ?? "",
        checkInTime: prop.policies.checkInTime,
        checkOutTime: prop.policies.checkOutTime,
        cancellationPolicyType: prop.policies.cancellationPolicyType,
        amenityIds: prop.amenityIds,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης καταλύματος");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProperty();
  }, [tenantId, propertyId]);

  useBreadcrumbEntityLabels(
    property
      ? { [propertyId]: property.name }
      : {},
  );

  async function save(updates: Record<string, unknown>) {
    if (!tenantId) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const updated = await adminFetch<PropertyRecord>(`/properties/${propertyId}`, {
        method: "PATCH",
        tenantId,
        body: JSON.stringify(updates),
      });
      invalidatePropertiesCache(tenantId);
      await refreshActiveProperty(
        activePropertyId === propertyId
          ? { preferredPropertyId: propertyId }
          : undefined,
      );
      setProperty(updated);
      setMessage("Αποθηκεύτηκε επιτυχώς");
      toastSuccess("Αποθηκεύτηκε επιτυχώς");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία αποθήκευσης");
      toastError(err instanceof Error ? err.message : "Αποτυχία αποθήκευσης");
    } finally {
      setSaving(false);
    }
  }

  async function archiveProperty() {
    if (!tenantId) return;
    await adminFetch(`/properties/${propertyId}`, { method: "DELETE", tenantId });
    invalidatePropertiesCache(tenantId);
    await refreshActiveProperty();
    toastSuccess("Το κατάλυμα αρχειοθετήθηκε");
    router.push("/dashboard/properties");
  }

  async function activateProperty() {
    setForm((prev) => ({ ...prev, status: "active" }));
    await save({ status: "active" });
  }

  async function saveStaffPin() {
    if (!tenantId) return;
    if (staffPin !== staffPinConfirm) {
      toastError("Τα PIN δεν ταιριάζουν");
      return;
    }
    if (!/^\d{4,8}$/.test(staffPin)) {
      toastError("Το PIN πρέπει να είναι 4–8 ψηφία");
      return;
    }
    setPinSaving(true);
    try {
      await adminFetch(`/properties/${propertyId}/staff-pin`, {
        method: "PUT",
        tenantId,
        body: JSON.stringify({ pin: staffPin }),
      });
      setStaffPin("");
      setStaffPinConfirm("");
      toastSuccess("Το PIN προσωπικού αποθηκεύτηκε");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Αποτυχία αποθήκευσης PIN");
    } finally {
      setPinSaving(false);
    }
  }

  const tenantGate = renderTenantGate({
    loading: tenantLoading,
    error: tenantError,
    tenantId,
  });
  if (tenantGate) return tenantGate;
  if (loading) return <Skeleton className="h-96 w-full" />;
  if (error && !property) return <ErrorState message={error} onRetry={() => void loadProperty()} />;
  if (!property) return <ErrorState message="Το κατάλυμα δεν βρέθηκε" />;

  const isDraft = property.status === "draft";

  return (
    <div className="space-y-4">
      <PageHeader
        title={property.name}
        description={`/${property.slug} · λεπτομέρειες καταλύματος`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={property.status} />
            {isDraft ? (
              <Button size="sm" disabled={saving} onClick={() => void activateProperty()}>
                {saving ? elCommon.saving : "Ενεργοποίηση καταλύματος"}
              </Button>
            ) : null}
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/properties/${propertyId}/assistant`}>
                {elCommon.aiAssistant}
              </Link>
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setArchiveOpen(true)}>
              {elCommon.archive}
            </Button>
          </div>
        }
      />

      {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
      {error ? (
        <div>
          <ErrorState message={error} />
        </div>
      ) : null}

      {(isDraft || onboarding) && (
        <Surface variant="panel" padding="md">
          <SurfaceHeader
            title={isDraft ? "Το κατάλυμα είναι Πρόχειρο" : "Επόμενα βήματα"}
            description={
              isDraft
                ? "Τα πρόχειρα καταλύματα δέχονται τιμοκαταλόγους, αλλά όχι κρατήσεις ή έλεγχο διαθεσιμότητας. Ολοκληρώστε τη ρύθμιση και ενεργοποιήστε το."
                : "Οργανισμός και κατάλυμα είναι έτοιμα. Ορίστε τιμές και δημιουργήστε την πρώτη κράτηση."
            }
          />
          <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Ολοκληρώστε βασικά στοιχεία (όνομα, τοποθεσία, πολιτικές) αν χρειάζεται</li>
            <li>
              Ορίστε{" "}
              <Link href="/dashboard/pricing" className="underline underline-offset-2">
                τιμοκατάλογο
              </Link>{" "}
              για την προεπιλεγμένη μονάδα
            </li>
            <li>Ενεργοποιήστε το κατάλυμα (κατάσταση → Ενεργό)</li>
            <li>
              Δημιουργήστε{" "}
              <Link href="/dashboard/bookings/new" className="underline underline-offset-2">
                χειροκίνητη κράτηση
              </Link>
            </li>
          </ol>
          {isDraft ? (
            <Button disabled={saving} onClick={() => void activateProperty()}>
              {saving ? elCommon.saving : "Ενεργοποίηση καταλύματος"}
            </Button>
          ) : (
            <Button asChild>
              <Link href="/dashboard/bookings/new">Νέα κράτηση</Link>
            </Button>
          )}
        </Surface>
      )}

      <Tabs defaultValue={onboarding || isDraft ? "status" : "general"}>
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="general">Γενικά</TabsTrigger>
          <TabsTrigger value="units">Μονάδες</TabsTrigger>
          <TabsTrigger value="amenities">Παροχές</TabsTrigger>
          <TabsTrigger value="policies">Πολιτικές</TabsTrigger>
          <TabsTrigger value="location">Τοποθεσία</TabsTrigger>
          <TabsTrigger value="status">Κατάσταση</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Surface variant="panel" padding="md">
            <SurfaceHeader
              title="Γενικές πληροφορίες"
              description="Όνομα, τύπος, ζώνη ώρας και δημόσια περιγραφή."
            />
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{elCommon.name}</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{elCommon.type}</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="villa">Βίλα</SelectItem>
                      <SelectItem value="apartment">Διαμέρισμα</SelectItem>
                      <SelectItem value="hotel">Ξενοδοχείο</SelectItem>
                      <SelectItem value="other">Άλλο</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Ζώνη ώρας</Label>
                  <Input
                    value={form.timezone}
                    onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Περιγραφή</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={4}
                />
              </div>
              <Button
                disabled={saving}
                onClick={() =>
                  void save({
                    name: form.name,
                    description: form.description || null,
                    type: form.type,
                    timezone: form.timezone,
                  })
                }
              >
                {saving ? "Αποθήκευση…" : "Αποθήκευση γενικών"}
              </Button>
            </div>
          </Surface>
        </TabsContent>

        <TabsContent value="units">
          <Surface variant="panel" padding="none">
            <div className="border-b border-border px-4 py-3">
              <SurfaceHeader
                className="mb-0"
                title="Μονάδες"
                description="Δωμάτια για αυτό το κατάλυμα. Διαχείρισμός από τις Μονάδες."
                action={
                  <Button size="sm" asChild>
                    <Link href={`/dashboard/units?propertyId=${propertyId}`}>Διαχείριση μονάδων</Link>
                  </Button>
                }
              />
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{elCommon.name}</TableHead>
                    <TableHead>{elCommon.guests}</TableHead>
                    <TableHead>Υπνοδωμάτια</TableHead>
                    <TableHead>{elCommon.status}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {property.units.map((unit) => (
                    <TableRow key={unit.id}>
                      <TableCell>{displayUnitName(unit.name)}</TableCell>
                      <TableCell>{unit.maxGuests}</TableCell>
                      <TableCell>{unit.bedrooms}</TableCell>
                      <TableCell>
                        <StatusBadge status={unit.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Surface>
        </TabsContent>

        <TabsContent value="amenities">
          <Surface variant="panel" padding="md">
            <SurfaceHeader
              title="Παροχές"
              description="Χαρακτηριστικά στην καταχώρηση. Αποθηκεύστε μετά την αλλαγή επιλογής."
            />
            <div className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                {amenities.map((amenity) => {
                  const checked = form.amenityIds.includes(amenity.id);
                  return (
                    <label
                      key={amenity.id}
                      className="flex items-center gap-2 rounded-md border border-border bg-surface-subtle p-3"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setForm({
                            ...form,
                            amenityIds: e.target.checked
                              ? [...form.amenityIds, amenity.id]
                              : form.amenityIds.filter((id) => id !== amenity.id),
                          });
                        }}
                      />
                      <span>{amenity.name}</span>
                    </label>
                  );
                })}
              </div>
              {amenities.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Δεν υπάρχουν ακόμα παροχές.{" "}
                  <Link href="/dashboard/amenities" className="underline">
                    Δημιουργία παροχών
                  </Link>
                </p>
              ) : null}
              <Button disabled={saving} onClick={() => void save({ amenityIds: form.amenityIds })}>
                Αποθήκευση παροχών
              </Button>
            </div>
          </Surface>
        </TabsContent>

        <TabsContent value="policies">
          <Surface variant="panel" padding="md">
            <SurfaceHeader
              title="Πολιτικές"
              description="Ώρες άφιξης/αναχώρησης και πολιτική ακύρωσης."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Ώρα άφιξης</Label>
                <Input
                  value={form.checkInTime}
                  onChange={(e) => setForm({ ...form, checkInTime: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Ώρα αναχώρησης</Label>
                <Input
                  value={form.checkOutTime}
                  onChange={(e) => setForm({ ...form, checkOutTime: e.target.value })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Πολιτική ακύρωσης</Label>
                <Select
                  value={form.cancellationPolicyType}
                  onValueChange={(v) => setForm({ ...form, cancellationPolicyType: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flexible">Ευέλικτη</SelectItem>
                    <SelectItem value="moderate">Μέτρια</SelectItem>
                    <SelectItem value="strict">Αυστηρή</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                disabled={saving}
                onClick={() =>
                  void save({
                    policies: {
                      checkInTime: form.checkInTime,
                      checkOutTime: form.checkOutTime,
                      cancellationPolicyType: form.cancellationPolicyType,
                    },
                  })
                }
              >
                Αποθήκευση πολιτικών
              </Button>
            </div>
          </Surface>
        </TabsContent>

        <TabsContent value="location">
          <Surface variant="panel" padding="md">
            <SurfaceHeader
              title="Τοποθεσία"
              description="Διεύθυνση για καταχώρηση και επικοινωνία με επισκέπτες."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Διεύθυνση</Label>
                <Input
                  value={form.addressLine}
                  onChange={(e) => setForm({ ...form, addressLine: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Πόλη</Label>
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Περιοχή</Label>
                <Input
                  value={form.region}
                  onChange={(e) => setForm({ ...form, region: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Τ.Κ.</Label>
                <Input
                  value={form.postalCode}
                  onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Χώρα (ISO)</Label>
                <Input
                  maxLength={2}
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                />
              </div>
              <Button
                disabled={saving}
                onClick={() =>
                  void save({
                    location: {
                      addressLine: form.addressLine || null,
                      city: form.city || null,
                      region: form.region || null,
                      postalCode: form.postalCode || null,
                      country: form.country || null,
                    },
                  })
                }
              >
                Αποθήκευση τοποθεσίας
              </Button>
            </div>
          </Surface>
        </TabsContent>

        <TabsContent value="status">
          <Surface variant="panel" padding="md">
            <SurfaceHeader
              title="Κατάσταση λειτουργίας"
              description={
                isDraft
                  ? "Πρόχειρο: μπορείτε να ρυθμίσετε τιμές. Διαθεσιμότητα και κρατήσεις απαιτούν κατάσταση Ενεργό."
                  : "Ενεργά καταλύματα δέχονται κρατήσεις. Ανενεργά αποκλείουν νέες κρατήσεις."
              }
            />
            <div className="space-y-4">
              {isDraft ? (
                <p className="text-sm text-muted-foreground">
                  Για να δέχεστε κρατήσεις: αποθηκεύστε τιμοκατάλογο (προαιρετικά πριν την
                  ενεργοποίηση) και πατήστε «Ενεργοποίηση καταλύματος».
                </p>
              ) : null}
              <div className="space-y-2">
                <Label>Κατάσταση</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">{statusLabelEl("draft")}</SelectItem>
                    <SelectItem value="active">{statusLabelEl("active")}</SelectItem>
                    <SelectItem value="inactive">{statusLabelEl("inactive")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={form.status} />
                <span className="text-sm text-muted-foreground">Slug: /{property.slug}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {isDraft ? (
                  <Button disabled={saving} onClick={() => void activateProperty()}>
                    {saving ? elCommon.saving : "Ενεργοποίηση καταλύματος"}
                  </Button>
                ) : null}
                <Button
                  variant={isDraft ? "outline" : "default"}
                  disabled={saving}
                  onClick={() => void save({ status: form.status })}
                >
                  {saving ? elCommon.saving : "Ενημέρωση κατάστασης"}
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/dashboard/pricing">Τιμοκατάλογος</Link>
                </Button>
              </div>

              <div className="space-y-3 border-t border-border pt-4">
                <SurfaceHeader
                  className="mb-0"
                  title="Ιστότοπος καταλύματος"
                  description="Αν οριστεί, το φυσικό QR ανακατευθύνει επισκέπτες εδώ. Το QR παραμένει /q/{token}."
                />
                <div className="space-y-2">
                  <Label>URL ιστότοπου (https)</Label>
                  <Input
                    type="url"
                    placeholder="https://example.com"
                    value={form.websiteUrl}
                    onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })}
                  />
                </div>
                <Button
                  disabled={saving}
                  onClick={() =>
                    void save({
                      websiteUrl: form.websiteUrl.trim()
                        ? form.websiteUrl.trim()
                        : null,
                    })
                  }
                >
                  {saving ? elCommon.saving : "Αποθήκευση ιστότοπου"}
                </Button>
              </div>

              <div className="space-y-3 border-t border-border pt-4">
                <SurfaceHeader
                  className="mb-0"
                  title="PIN προσωπικού καθαριότητας"
                  description="Απαιτείται για κάθε ενημέρωση Καθαρό / Δεν είναι καθαρό μέσω QR. Δεν αποθηκεύεται σε απλό κείμενο."
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Νέο PIN (4–8 ψηφία)</Label>
                    <Input
                      type="password"
                      inputMode="numeric"
                      autoComplete="new-password"
                      value={staffPin}
                      onChange={(e) =>
                        setStaffPin(e.target.value.replace(/\D/g, "").slice(0, 8))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Επιβεβαίωση PIN</Label>
                    <Input
                      type="password"
                      inputMode="numeric"
                      autoComplete="new-password"
                      value={staffPinConfirm}
                      onChange={(e) =>
                        setStaffPinConfirm(
                          e.target.value.replace(/\D/g, "").slice(0, 8),
                        )
                      }
                    />
                  </div>
                </div>
                <Button
                  disabled={pinSaving || staffPin.length < 4}
                  onClick={() => void saveStaffPin()}
                >
                  {pinSaving ? elCommon.saving : "Αποθήκευση PIN"}
                </Button>
              </div>
            </div>
          </Surface>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Αρχειοθέτηση καταλύματος"
        description="Το κατάλυμα θα αρχειοθετηθεί και θα αφαιρεθεί από ενεργές καταχωρήσεις."
        confirmLabel={elCommon.archive}
        destructive
        onConfirm={archiveProperty}
      />
    </div>
  );
}
