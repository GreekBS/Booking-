"use client";

import { useCallback, useEffect, useState } from "react";
import { useTenant } from "@/hooks/use-tenant";
import { adminFetch, fetchAllProperties } from "@/lib/admin/api";
import { toastError, toastSuccess } from "@/lib/admin/toast";
import type { PropertyRecord } from "@/lib/admin/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface BusinessProfile {
  id: string;
  propertyId: string;
  legalName: string;
  tradeName: string | null;
  country: string;
  vatNumber: string | null;
  fiscalJurisdiction: string;
  accommodationType: string;
  propertyClassification: string | null;
  floorAreaSqm: number | null;
  address: {
    line1: string;
    line2: string | null;
    city: string;
    region: string | null;
    postalCode: string;
    country: string;
  };
}

interface CustomerProfile {
  id: string;
  type: "INDIVIDUAL" | "BUSINESS";
  legalName: string;
  vatNumber: string | null;
  country: string;
  email: string | null;
  address: BusinessProfile["address"];
}

const emptyAddress = {
  line1: "",
  line2: null as string | null,
  city: "",
  region: null as string | null,
  postalCode: "",
  country: "GR",
};

export function FiscalSettingsSection() {
  const { tenantId } = useTenant();
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [businessProfiles, setBusinessProfiles] = useState<BusinessProfile[]>([]);
  const [customerProfiles, setCustomerProfiles] = useState<CustomerProfile[]>([]);
  const [saving, setSaving] = useState(false);
  const [propertyId, setPropertyId] = useState("");
  const [biz, setBiz] = useState({
    legalName: "",
    tradeName: "",
    country: "GR",
    vatNumber: "",
    fiscalJurisdiction: "GR",
    accommodationType: "short_term_rental",
    propertyClassification: "short_term_rental",
    floorAreaSqm: "",
    address: { ...emptyAddress },
  });
  const [customer, setCustomer] = useState({
    type: "INDIVIDUAL" as "INDIVIDUAL" | "BUSINESS",
    legalName: "",
    vatNumber: "",
    country: "GR",
    email: "",
    address: { ...emptyAddress },
  });

  const load = useCallback(async () => {
    if (!tenantId) return;
    const [propsPage, bizList, custList] = await Promise.all([
      fetchAllProperties(tenantId),
      adminFetch<{ profiles: BusinessProfile[] }>("/fiscal/business-profiles", {
        tenantId,
      }),
      adminFetch<{ profiles: CustomerProfile[] }>("/fiscal/customer-profiles", {
        tenantId,
      }),
    ]);
    const props = propsPage.data ?? [];
    setProperties(props);
    setBusinessProfiles(bizList.profiles ?? []);
    setCustomerProfiles(custList.profiles ?? []);
    if (!propertyId && props[0]) setPropertyId(props[0].id);
  }, [tenantId, propertyId]);

  useEffect(() => {
    void load().catch((err) =>
      toastError(err instanceof Error ? err.message : "Failed to load fiscal profiles"),
    );
  }, [load]);

  useEffect(() => {
    const existing = businessProfiles.find((p) => p.propertyId === propertyId);
    if (!existing) return;
    setBiz({
      legalName: existing.legalName,
      tradeName: existing.tradeName ?? "",
      country: existing.country,
      vatNumber: existing.vatNumber ?? "",
      fiscalJurisdiction: existing.fiscalJurisdiction,
      accommodationType: existing.accommodationType,
      propertyClassification: existing.propertyClassification ?? "unclassified",
      floorAreaSqm: existing.floorAreaSqm?.toString() ?? "",
      address: { ...existing.address },
    });
  }, [propertyId, businessProfiles]);

  async function saveBusiness() {
    if (!tenantId || !propertyId) return;
    setSaving(true);
    try {
      await adminFetch("/fiscal/business-profiles", {
        method: "PUT",
        tenantId,
        body: JSON.stringify({
          propertyId,
          legalName: biz.legalName,
          tradeName: biz.tradeName || null,
          country: biz.country,
          vatNumber: biz.vatNumber || null,
          fiscalJurisdiction: biz.fiscalJurisdiction,
          accommodationType: biz.accommodationType,
          propertyClassification: biz.propertyClassification || null,
          floorAreaSqm: biz.floorAreaSqm ? Number(biz.floorAreaSqm) : null,
          address: biz.address,
        }),
      });
      toastSuccess("Business fiscal profile saved");
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveCustomer() {
    if (!tenantId) return;
    setSaving(true);
    try {
      await adminFetch("/fiscal/customer-profiles", {
        method: "PUT",
        tenantId,
        body: JSON.stringify({
          type: customer.type,
          legalName: customer.legalName,
          vatNumber: customer.vatNumber || null,
          country: customer.country,
          email: customer.email || null,
          address: customer.address,
        }),
      });
      toastSuccess("Customer billing profile saved");
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Business fiscal profile</CardTitle>
          <CardDescription>
            Issuer identity per property/establishment. Jurisdiction is operator-assigned
            (e.g. GR or GR-ISLAND-REDUCED) — never auto-guessed. No invoices or myDATA yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Property / establishment</Label>
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger>
                <SelectValue placeholder="Select property" />
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
            <Label>Legal name</Label>
            <Input
              value={biz.legalName}
              onChange={(e) => setBiz({ ...biz, legalName: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Trade name</Label>
            <Input
              value={biz.tradeName}
              onChange={(e) => setBiz({ ...biz, tradeName: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>AFM / VAT</Label>
            <Input
              value={biz.vatNumber}
              onChange={(e) => setBiz({ ...biz, vatNumber: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Fiscal jurisdiction</Label>
            <Select
              value={biz.fiscalJurisdiction}
              onValueChange={(v) => setBiz({ ...biz, fiscalJurisdiction: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GR">GR (standard rates)</SelectItem>
                <SelectItem value="GR-ISLAND-REDUCED">
                  GR-ISLAND-REDUCED (30% cut — verified eligibility only)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Accommodation type</Label>
            <Select
              value={biz.accommodationType}
              onValueChange={(v) => setBiz({ ...biz, accommodationType: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hotel">Hotel</SelectItem>
                <SelectItem value="furnished_rooms_apartments">
                  Furnished rooms/apartments
                </SelectItem>
                <SelectItem value="short_term_rental">Short-term rental</SelectItem>
                <SelectItem value="villa_self_catering">Villa / self-catering</SelectItem>
                <SelectItem value="tourist_furnished_house">
                  Tourist furnished house
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Property classification</Label>
            <Select
              value={biz.propertyClassification}
              onValueChange={(v) => setBiz({ ...biz, propertyClassification: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hotel_stars_1_2">Hotel 1–2★</SelectItem>
                <SelectItem value="hotel_stars_3">Hotel 3★</SelectItem>
                <SelectItem value="hotel_stars_4">Hotel 4★</SelectItem>
                <SelectItem value="hotel_stars_5">Hotel 5★</SelectItem>
                <SelectItem value="furnished_rooms_apartments">
                  Furnished rooms/apartments
                </SelectItem>
                <SelectItem value="short_term_rental">Short-term rental</SelectItem>
                <SelectItem value="short_term_rental_detached_gt_80sqm">
                  STR detached &gt;80 m²
                </SelectItem>
                <SelectItem value="villa_self_catering">Villa</SelectItem>
                <SelectItem value="tourist_furnished_house_lt_80sqm">
                  Tourist house &lt;80 m²
                </SelectItem>
                <SelectItem value="tourist_furnished_house_gte_80sqm">
                  Tourist house ≥80 m²
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Address line 1</Label>
            <Input
              value={biz.address.line1}
              onChange={(e) =>
                setBiz({ ...biz, address: { ...biz.address, line1: e.target.value } })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>City</Label>
            <Input
              value={biz.address.city}
              onChange={(e) =>
                setBiz({ ...biz, address: { ...biz.address, city: e.target.value } })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Postal code</Label>
            <Input
              value={biz.address.postalCode}
              onChange={(e) =>
                setBiz({
                  ...biz,
                  address: { ...biz.address, postalCode: e.target.value },
                })
              }
            />
          </div>
          <div className="sm:col-span-2">
            <Button disabled={saving || !propertyId} onClick={() => void saveBusiness()}>
              Save business fiscal profile
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Customer billing profiles</CardTitle>
          <CardDescription>
            Invoice recipient may differ from Booking guest. Individuals are not required
            to have an AFM.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              value={customer.type}
              onValueChange={(v) =>
                setCustomer({ ...customer, type: v as "INDIVIDUAL" | "BUSINESS" })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                <SelectItem value="BUSINESS">Business</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Legal name</Label>
            <Input
              value={customer.legalName}
              onChange={(e) => setCustomer({ ...customer, legalName: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>AFM / VAT (optional for individuals)</Label>
            <Input
              value={customer.vatNumber}
              onChange={(e) => setCustomer({ ...customer, vatNumber: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              value={customer.email}
              onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Address line 1</Label>
            <Input
              value={customer.address.line1}
              onChange={(e) =>
                setCustomer({
                  ...customer,
                  address: { ...customer.address, line1: e.target.value },
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>City</Label>
            <Input
              value={customer.address.city}
              onChange={(e) =>
                setCustomer({
                  ...customer,
                  address: { ...customer.address, city: e.target.value },
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Postal code</Label>
            <Input
              value={customer.address.postalCode}
              onChange={(e) =>
                setCustomer({
                  ...customer,
                  address: { ...customer.address, postalCode: e.target.value },
                })
              }
            />
          </div>
          <div className="sm:col-span-2">
            <Button disabled={saving} onClick={() => void saveCustomer()}>
              Add customer billing profile
            </Button>
          </div>
          {customerProfiles.length > 0 && (
            <ul className="sm:col-span-2 space-y-1 text-sm text-muted-foreground">
              {customerProfiles.map((p) => (
                <li key={p.id}>
                  {p.type}: {p.legalName}
                  {p.vatNumber ? ` · AFM ${p.vatNumber}` : ""}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
