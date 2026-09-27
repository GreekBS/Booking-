"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTenant } from "@/hooks/use-tenant";
import {
  renderActivePropertyGate,
  useActiveProperty,
} from "@/hooks/use-active-property";
import { listCleaningHistory } from "@/lib/admin/api";
import type { CleaningHistoryRecord } from "@/lib/admin/types";
import { PageHeader } from "@/components/admin/page-header";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
import { EmptyState } from "@/components/admin/empty-state";
import { ErrorState } from "@/components/admin/error-state";
import { StatusBadge } from "@/components/admin/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

function formatTimestamp(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

/** Cleaning audit trail for the Active Property, optionally filtered by unit. */
export function CleaningHistoryPage() {
  const searchParams = useSearchParams();
  const unitId = searchParams.get("unitId") ?? undefined;
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const {
    propertyId,
    property,
    properties: activeProperties,
    ready: propertyReady,
    error: propertyError,
  } = useActiveProperty();

  const [rows, setRows] = useState<CleaningHistoryRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId || !propertyId) return;
    setLoading(true);
    try {
      const page = await listCleaningHistory(tenantId, {
        propertyId,
        unitId,
        limit: 50,
      });
      setRows(page.data);
      setTotal(page.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης ιστορικού");
    } finally {
      setLoading(false);
    }
  }, [tenantId, propertyId, unitId]);

  useEffect(() => {
    void load();
  }, [load]);

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
  if (loading) return <Skeleton className="h-96 w-full" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Ιστορικό καθαρισμών"
        description={
          unitId
            ? `Καθαρισμοί για την επιλεγμένη μονάδα${property ? ` · ${property.name}` : ""}`
            : `Καθαρισμοί${property ? ` · ${property.name}` : ""}`
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Δεν έχουν καταγραφεί καθαρισμοί"
          description="Οι καθαρισμοί εμφανίζονται εδώ όταν το προσωπικό σκανάρει QR μονάδας και ολοκληρώνει τη λίστα ελέγχου."
        />
      ) : (
        <Surface variant="panel" padding="none">
          <div className="border-b border-border px-4 py-3">
            <SurfaceHeader
              className="mb-0"
              title="Ολοκληρωμένοι και ενεργοί καθαρισμοί"
              description={`${total} ${total === 1 ? "εγγραφή" : "εγγραφές"}`}
            />
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Μονάδα</TableHead>
                  <TableHead>Εργασία</TableHead>
                  <TableHead>Κατάσταση</TableHead>
                  <TableHead>Έναρξη</TableHead>
                  <TableHead>Ολοκλήρωση</TableHead>
                  <TableHead>Λίστα</TableHead>
                  <TableHead>Φωτογραφίες</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.unitName}</TableCell>
                    <TableCell>{row.taskTitle}</TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell>{formatTimestamp(row.startedAt)}</TableCell>
                    <TableCell>{formatTimestamp(row.completedAt)}</TableCell>
                    <TableCell>
                      {row.itemsChecked}/{row.itemsTotal}
                    </TableCell>
                    <TableCell>{row.photoCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Surface>
      )}
    </div>
  );
}
