"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTenant } from "@/hooks/use-tenant";
import { adminFetch } from "@/lib/admin/api";
import { toastError, toastSuccess } from "@/lib/admin/toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { fiscalDocumentKindLabelEl } from "@/lib/i18n";

interface FolioLine {
  id: string;
  description: string;
  amount: string;
  currency: string;
  lineType: string;
  taxSnapshot: { taxType?: string } | null;
}

interface Coverage {
  folioLineId: string;
  remainingAbs: string;
  status: string;
}

interface Series {
  id: string;
  documentKind: string;
  seriesCode: string;
  active: boolean;
  propertyId: string;
}

interface Customer {
  id: string;
  legalName: string;
  type: string;
  vatNumber: string | null;
}

const KINDS = [
  "SERVICE_RECEIPT",
  "SERVICE_INVOICE",
  "CLIMATE_RESILIENCE_FEE_RECEIPT",
] as const;

export function FolioFiscalIssuePanel(props: {
  folioId: string;
  propertyId: string;
  lines: FolioLine[];
}) {
  const { tenantId } = useTenant();
  const [series, setSeries] = useState<Series[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [coverage, setCoverage] = useState<Coverage[]>([]);
  const [kind, setKind] = useState<(typeof KINDS)[number]>("SERVICE_RECEIPT");
  const [seriesId, setSeriesId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    const [s, c, cov] = await Promise.all([
      adminFetch<{ series: Series[] }>("/fiscal/series", { tenantId }),
      adminFetch<{ profiles: Customer[] }>("/fiscal/customer-profiles", {
        tenantId,
      }),
      adminFetch<{ coverage: Coverage[] }>(
        `/folios/${props.folioId}/fiscal-coverage`,
        { tenantId },
      ),
    ]);
    setSeries(
      (s.series ?? []).filter(
        (x) => x.active && x.propertyId === props.propertyId,
      ),
    );
    setCustomers(c.profiles ?? []);
    setCoverage(cov.coverage ?? []);
  }, [tenantId, props.folioId, props.propertyId]);

  useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);

  const remainingByLine = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of coverage) m.set(c.folioLineId, c.remainingAbs);
    return m;
  }, [coverage]);

  const eligibleSeries = series.filter((s) => s.documentKind === kind);

  async function previewAndIssue() {
    if (!tenantId || !seriesId) {
      toastError("Επιλέξτε σειρά παραστατικών");
      return;
    }
    const lineSelections = props.lines
      .filter((l) => selected[l.id])
      .map((l) => ({
        folioLineId: l.id,
        allocateAmount: remainingByLine.get(l.id) ?? l.amount.replace("-", ""),
      }))
      .filter((s) => Number(s.allocateAmount) > 0);

    if (!lineSelections.length) {
      toastError("Επιλέξτε γραμμές folio με υπόλοιπο κάλυψης");
      return;
    }

    setBusy(true);
    try {
      const draft = await adminFetch<{
        document: { id: string };
      }>("/fiscal/documents", {
        tenantId,
        method: "POST",
        body: JSON.stringify({
          folioId: props.folioId,
          seriesId,
          documentKind: kind,
          customerBillingProfileId:
            kind === "SERVICE_INVOICE" ? customerId || null : null,
          lineSelections,
        }),
      });
      const key = `issue:${draft.document.id}:${tenantId}`;
      await adminFetch(`/fiscal/documents/${draft.document.id}/issue`, {
        tenantId,
        method: "POST",
        body: JSON.stringify({ issuanceIdempotencyKey: key }),
      });
      toastSuccess("Εκδόθηκε τοπικά — εκκρεμεί ενσωμάτωση myDATA");
      await load();
      setSelected({});
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Η έκδοση παραστατικού απέτυχε");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div>
        <h3 className="font-medium">Παραστατικά</h3>
        <p className="text-sm text-muted-foreground">
          Προεπισκόπηση και τοπική έκδοση. Δεν αποστέλλεται στην ΑΑΔΕ.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Είδος παραστατικού</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {fiscalDocumentKindLabelEl(k)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Σειρά παραστατικών</Label>
          <Select value={seriesId} onValueChange={setSeriesId}>
            <SelectTrigger>
              <SelectValue placeholder="Επιλέξτε σειρά" />
            </SelectTrigger>
            <SelectContent>
              {eligibleSeries.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.seriesCode}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {kind === "SERVICE_INVOICE" && (
          <div className="space-y-2 sm:col-span-2">
            <Label>Παραλήπτης B2B</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger>
                <SelectValue placeholder="Προφίλ χρέωσης πελάτη" />
              </SelectTrigger>
              <SelectContent>
                {customers
                  .filter((c) => c.type === "BUSINESS" && c.vatNumber)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.legalName} ({c.vatNumber})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Label>Γραμμές folio</Label>
        <div className="space-y-2 max-h-56 overflow-y-auto">
          {props.lines.map((l) => {
            const rem = remainingByLine.get(l.id) ?? l.amount.replace("-", "");
            const climate =
              l.taxSnapshot?.taxType === "climate_resilience_fee";
            const disabled =
              Number(rem) <= 0 ||
              (kind === "CLIMATE_RESILIENCE_FEE_RECEIPT" && !climate) ||
              (kind !== "CLIMATE_RESILIENCE_FEE_RECEIPT" && climate);
            return (
              <label
                key={l.id}
                className="flex items-start gap-2 text-sm border rounded p-2"
              >
                <Input
                  type="checkbox"
                  className="h-4 w-4 mt-1"
                  checked={!!selected[l.id]}
                  disabled={disabled}
                  onChange={(e) =>
                    setSelected({ ...selected, [l.id]: e.target.checked })
                  }
                />
                <span className="flex-1">
                  <span className="font-medium">{l.description}</span>
                  <span className="block text-muted-foreground">
                    {l.lineType} · υπόλοιπο {rem} {l.currency}
                    {climate ? " · τέλος κλιματικής ανθεκτικότητας" : ""}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </div>
      <Button onClick={() => void previewAndIssue()} disabled={busy}>
        {busy ? "Εργασία…" : "Έκδοση επιλεγμένων γραμμών τοπικά"}
      </Button>
    </div>
  );
}
