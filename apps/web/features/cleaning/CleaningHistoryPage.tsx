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
      setError(err instanceof Error ? err.message : "Failed to load history");
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
        title="Cleaning history"
        description={
          unitId
            ? `Cleanings recorded for the selected unit${property ? ` at ${property.name}` : ""}`
            : `Cleanings recorded${property ? ` at ${property.name}` : ""}`
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No cleanings recorded"
          description="Cleanings appear here once housekeepers scan a unit QR code and complete the checklist."
        />
      ) : (
        <Surface variant="panel" padding="none">
          <div className="border-b border-border px-4 py-3">
            <SurfaceHeader
              className="mb-0"
              title="Completed and in-progress cleanings"
              description={`${total} record${total === 1 ? "" : "s"}`}
            />
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit</TableHead>
                  <TableHead>Task</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Checklist</TableHead>
                  <TableHead>Photos</TableHead>
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
