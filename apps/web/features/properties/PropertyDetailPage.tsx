"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { renderTenantGate, useTenant } from "@/hooks/use-tenant";
import { adminFetch, invalidatePropertiesCache } from "@/lib/admin/api";
import type { AmenityRecord, PropertyRecord } from "@/lib/admin/types";
import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/admin/error-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

interface PropertyDetailPageProps {
  propertyId: string;
}

export function PropertyDetailPage({ propertyId }: PropertyDetailPageProps) {
  const router = useRouter();
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
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
      setError(err instanceof Error ? err.message : "Failed to load property");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProperty();
  }, [tenantId, propertyId]);

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
      setProperty(updated);
      setMessage("Saved successfully");
      toastSuccess("Saved successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      toastError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function archiveProperty() {
    if (!tenantId) return;
    await adminFetch(`/properties/${propertyId}`, { method: "DELETE", tenantId });
    invalidatePropertiesCache(tenantId);
    toastSuccess("Property archived");
    router.push("/dashboard/properties");
  }

  const tenantGate = renderTenantGate({
    loading: tenantLoading,
    error: tenantError,
    tenantId,
  });
  if (tenantGate) return tenantGate;
  if (loading) return <Skeleton className="h-96 w-full" />;
  if (error && !property) return <ErrorState message={error} onRetry={() => void loadProperty()} />;
  if (!property) return <ErrorState message="Property not found" />;

  return (
    <div>
      <PageHeader
        title={property.name}
        description={`/${property.slug}`}
        actions={
          <div className="flex gap-2">
            <StatusBadge status={property.status} />
            <Button variant="destructive" size="sm" onClick={() => setArchiveOpen(true)}>
              Archive
            </Button>
          </div>
        }
      />

      {message && <p className="mb-4 text-sm text-emerald-600">{message}</p>}
      {error && <div className="mb-4"><ErrorState message={error} /></div>}

      <Tabs defaultValue="general">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="units">Units</TabsTrigger>
          <TabsTrigger value="amenities">Amenities</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
          <TabsTrigger value="location">Location</TabsTrigger>
          <TabsTrigger value="status">Status</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader><CardTitle>General information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="villa">Villa</SelectItem>
                      <SelectItem value="apartment">Apartment</SelectItem>
                      <SelectItem value="hotel">Hotel</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
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
                {saving ? "Saving..." : "Save general"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="units">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Units</CardTitle>
              <Button size="sm" asChild>
                <Link href={`/dashboard/units?propertyId=${propertyId}`}>Manage units</Link>
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Guests</TableHead>
                    <TableHead>Bedrooms</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {property.units.map((unit) => (
                    <TableRow key={unit.id}>
                      <TableCell>{unit.name}</TableCell>
                      <TableCell>{unit.maxGuests}</TableCell>
                      <TableCell>{unit.bedrooms}</TableCell>
                      <TableCell><StatusBadge status={unit.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="amenities">
          <Card>
            <CardHeader><CardTitle>Amenities</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                {amenities.map((amenity) => {
                  const checked = form.amenityIds.includes(amenity.id);
                  return (
                    <label key={amenity.id} className="flex items-center gap-2 rounded-md border p-3">
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
              {amenities.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No amenities yet. <Link href="/dashboard/amenities" className="underline">Create amenities</Link>
                </p>
              )}
              <Button disabled={saving} onClick={() => void save({ amenityIds: form.amenityIds })}>
                Save amenities
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="policies">
          <Card>
            <CardHeader><CardTitle>Policies</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Check-in time</Label>
                <Input value={form.checkInTime} onChange={(e) => setForm({ ...form, checkInTime: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Check-out time</Label>
                <Input value={form.checkOutTime} onChange={(e) => setForm({ ...form, checkOutTime: e.target.value })} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Cancellation policy</Label>
                <Select
                  value={form.cancellationPolicyType}
                  onValueChange={(v) => setForm({ ...form, cancellationPolicyType: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flexible">Flexible</SelectItem>
                    <SelectItem value="moderate">Moderate</SelectItem>
                    <SelectItem value="strict">Strict</SelectItem>
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
                Save policies
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="location">
          <Card>
            <CardHeader><CardTitle>Location</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Address</Label>
                <Input value={form.addressLine} onChange={(e) => setForm({ ...form, addressLine: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Region</Label>
                <Input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Postal code</Label>
                <Input value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Country (ISO)</Label>
                <Input maxLength={2} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
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
                Save location
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="status">
          <Card>
            <CardHeader><CardTitle>Publication status</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Active properties are visible on the storefront. Draft properties are admin-only.
              </p>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={form.status} />
                <span className="text-sm text-muted-foreground">Slug: /{property.slug}</span>
              </div>
              <Button disabled={saving} onClick={() => void save({ status: form.status })}>
                {saving ? "Saving..." : "Update status"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archive property"
        description="This will archive the property and remove it from active listings."
        confirmLabel="Archive"
        destructive
        onConfirm={archiveProperty}
      />
    </div>
  );
}
