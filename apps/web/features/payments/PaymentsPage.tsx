"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTenant } from "@/hooks/use-tenant";
import {
  renderActivePropertyGate,
  useActiveProperty,
} from "@/hooks/use-active-property";
import { adminFetch } from "@/lib/admin/api";
import {
  collectionSourceLabel,
  formatOperatorDateTime,
  formatOperatorMoney,
  moneyCellClassName,
  paymentMethodLabel,
  paymentStatusLabel,
} from "@/lib/admin/money-presentation";
import { toastError, toastSuccess } from "@/lib/admin/toast";
import { PageHeader } from "@/components/admin/page-header";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
import { EmptyState } from "@/components/admin/empty-state";
import { ErrorState } from "@/components/admin/error-state";
import { StatusBadge } from "@/components/admin/status-badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

interface PaymentRow {
  id: string;
  amount: string;
  currency: string;
  status: string;
  method: string;
  collectionSource: string;
  propertyId: string;
  bookingId: string | null;
  payerName: string | null;
  externalReference: string | null;
  receivedAt: string;
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pay-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const METHODS = ["CASH", "CARD", "BANK_TRANSFER", "OTA", "OTHER"] as const;
const SOURCES = ["PROPERTY", "DIRECT", "OTA", "PAYMENT_GATEWAY", "OTHER"] as const;

export function PaymentsPage() {
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const {
    propertyId,
    property,
    properties,
    ready: propertyReady,
    error: propertyError,
  } = useActiveProperty();
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payCurrency, setPayCurrency] = useState("EUR");
  const [payMethod, setPayMethod] = useState<string>("CASH");
  const [collectionSource, setCollectionSource] = useState<string>("PROPERTY");
  const [bookingId, setBookingId] = useState("");
  const [payerName, setPayerName] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId || !propertyId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await adminFetch<{ payments: PaymentRow[] }>(
        `/payments?propertyId=${encodeURIComponent(propertyId)}`,
        { tenantId },
      );
      setRows(res.payments ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης πληρωμών");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const succeeded = rows.filter((p) => p.status === "SUCCEEDED");
    const currency = succeeded[0]?.currency ?? rows[0]?.currency ?? "EUR";
    let collected = 0;
    for (const p of succeeded) {
      const n = Number.parseFloat(p.amount);
      if (!Number.isNaN(n)) collected += n;
    }
    return {
      count: rows.length,
      succeededCount: succeeded.length,
      collected,
      currency,
    };
  }, [rows]);

  async function recordPayment() {
    if (!tenantId || !propertyId || !payAmount.trim()) return;
    setRecording(true);
    setRecordError(null);
    try {
      const trimmedBooking = bookingId.trim();
      await adminFetch("/payments", {
        method: "POST",
        tenantId,
        body: JSON.stringify({
          amount: payAmount.trim(),
          currency: payCurrency.trim().toUpperCase() || "EUR",
          method: payMethod,
          collectionSource,
          propertyId,
          bookingId: trimmedBooking || undefined,
          payerName: payerName.trim() || null,
          externalReference: externalReference.trim() || null,
          idempotencyKey: newIdempotencyKey(),
        }),
      });
      setPayAmount("");
      setBookingId("");
      setPayerName("");
      setExternalReference("");
      setShowForm(false);
      toastSuccess("Η πληρωμή καταχωρήθηκε");
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Η πληρωμή απέτυχε";
      setRecordError(msg);
      toastError(msg);
    } finally {
      setRecording(false);
    }
  }

  const propertyGate = renderActivePropertyGate({
    tenantLoading,
    tenantError,
    tenantId,
    propertyReady,
    propertyError,
    propertyId,
    properties,
  });
  if (propertyGate) return propertyGate;

  return (
    <div>
      <PageHeader
        title="Πληρωμές"
        description="Λειτουργικό βιβλίο πληρωμών — χρήματα που εισπράχθηκαν για το ενεργό κατάλυμα. Ξεχωριστά από τον συμψηφισμό folio και τα παραστατικά."
        meta={
          property?.name ? (
            <span className="text-xs text-muted-foreground">
              Ενεργό κατάλυμα · <span className="font-medium text-foreground">{property.name}</span>
            </span>
          ) : null
        }
        actions={
          <Button
            onClick={() => {
              setShowForm((v) => !v);
              setRecordError(null);
            }}
          >
            {showForm ? "Απόκρυψη φόρμας" : "Καταχώρηση πληρωμής"}
          </Button>
        }
      />

      {!loading && rows.length > 0 ? (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Surface variant="metric" padding="sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Collected
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {formatOperatorMoney(String(summary.collected), summary.currency)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Άθροισμα επιτυχών (SUCCEEDED) πληρωμών στη λίστα
            </p>
          </Surface>
          <Surface variant="metric" padding="sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Succeeded
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{summary.succeededCount}</p>
            <p className="text-[11px] text-muted-foreground">Μόνο SUCCEEDED επηρεάζει τον συμψηφισμό</p>
          </Surface>
          <Surface variant="metric" padding="sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Payment count
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{summary.count}</p>
            <p className="text-[11px] text-muted-foreground">Όλες οι καταστάσεις · έως 100 εγγραφές</p>
          </Surface>
        </div>
      ) : null}

      {showForm ? (
        <Surface className="mb-5">
          <SurfaceHeader
            title="Καταχώρηση πληρωμής"
            description="Δημιουργεί πληρωμή του καταλύματος. Η σύνδεση με κράτηση είναι προαιρετική (επιτρέπονται μη κατανεμημένες πληρωμές)."
          />
          {recordError ? (
            <div className="mb-3">
              <ErrorState message={recordError} />
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="pay-amount">Ποσό</Label>
              <Input
                id="pay-amount"
                inputMode="decimal"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-currency">Νόμισμα</Label>
              <Input
                id="pay-currency"
                maxLength={3}
                value={payCurrency}
                onChange={(e) => setPayCurrency(e.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Τρόπος πληρωμής</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger aria-label="Payment method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {paymentMethodLabel(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Πηγή είσπραξης</Label>
              <Select value={collectionSource} onValueChange={setCollectionSource}>
                <SelectTrigger aria-label="Collection source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {collectionSourceLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-booking">Booking ID (optional)</Label>
              <Input
                id="pay-booking"
                value={bookingId}
                onChange={(e) => setBookingId(e.target.value)}
                placeholder="UUID — αφήστε κενό αν δεν είναι κατανεμημένη"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-payer">Payer (optional)</Label>
              <Input
                id="pay-payer"
                value={payerName}
                onChange={(e) => setPayerName(e.target.value)}
                placeholder="Όνομα επισκέπτη ή πληρωτή"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
              <Label htmlFor="pay-ref">External reference (optional)</Label>
              <Input
                id="pay-ref"
                value={externalReference}
                onChange={(e) => setExternalReference(e.target.value)}
                placeholder="Τραπεζική αναφ., id πύλης, id πληρωμής OTA…"
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              disabled={recording || !payAmount.trim()}
              onClick={() => void recordPayment()}
            >
              {recording ? "Καταχώρηση…" : "Καταχώρηση πληρωμής"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
              Ακύρωση
            </Button>
          </div>
        </Surface>
      ) : null}

      <Surface padding="none">
        <div className="border-b border-border px-4 py-3">
          <SurfaceHeader
            className="mb-0"
            title="Βιβλίο πληρωμών"
            description="Νεότερες πρώτα. Τρόπος πληρωμής και πηγή είσπραξης είναι ξεχωριστά πεδία."
          />
        </div>
        {loadError ? (
          <div className="p-4">
            <ErrorState message={loadError} onRetry={() => void load()} />
          </div>
        ) : loading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              compact
              title="Δεν υπάρχουν καταχωρημένες πληρωμές"
              description="Καταχωρήστε πληρωμή για αυτό το κατάλυμα ή περιμένετε πληρωμές από κρατήσεις."
              action={{
                label: "Καταχώρηση πληρωμής",
                onClick: () => setShowForm(true),
              }}
            />
          </div>
        ) : (
          <>
            {/* Desktop / tablet ledger */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ημερομηνία</TableHead>
                    <TableHead className="text-right">Ποσό</TableHead>
                    <TableHead>Τρόπος πληρωμής</TableHead>
                    <TableHead className="hidden lg:table-cell">Πηγή</TableHead>
                    <TableHead>Κατάσταση</TableHead>
                    <TableHead className="hidden lg:table-cell">Κράτηση</TableHead>
                    <TableHead className="hidden xl:table-cell">Αναφορά</TableHead>
                    <TableHead className="hidden sm:table-cell">Πληρωτής</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatOperatorDateTime(p.receivedAt)}
                      </TableCell>
                      <TableCell className={moneyCellClassName("text-sm")}>
                        {formatOperatorMoney(p.amount, p.currency)}
                      </TableCell>
                      <TableCell className="text-xs">{paymentMethodLabel(p.method)}</TableCell>
                      <TableCell className="hidden text-xs lg:table-cell">
                        {collectionSourceLabel(p.collectionSource)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={p.status}
                          label={paymentStatusLabel(p.status)}
                        />
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {p.bookingId ? (
                          <Link
                            href={`/dashboard/bookings?bookingId=${p.bookingId}`}
                            className="font-mono text-[11px] text-primary underline-offset-2 hover:underline"
                          >
                            {p.bookingId.slice(0, 8)}…
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">Μη κατανεμημένη</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden max-w-[140px] truncate text-xs text-muted-foreground xl:table-cell">
                        {p.externalReference ?? "—"}
                      </TableCell>
                      <TableCell className="hidden text-xs sm:table-cell">
                        {p.payerName ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-y divide-border md:hidden">
              {rows.map((p) => (
                <li key={p.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold tabular-nums">
                        {formatOperatorMoney(p.amount, p.currency)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {formatOperatorDateTime(p.receivedAt)} · {paymentMethodLabel(p.method)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {p.bookingId
                          ? `Booking ${p.bookingId.slice(0, 8)}…`
                          : "Μη κατανεμημένη"}
                        {p.externalReference ? ` · ${p.externalReference}` : ""}
                      </p>
                    </div>
                    <StatusBadge status={p.status} label={paymentStatusLabel(p.status)} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Surface>
    </div>
  );
}
