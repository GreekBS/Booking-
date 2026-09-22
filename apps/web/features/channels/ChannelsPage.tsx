"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { renderTenantGate, useTenant } from "@/hooks/use-tenant";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { ErrorState } from "@/components/admin/error-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createIcalConnection,
  formatChannelApiError,
  listChannelConnections,
} from "./channel-api";
import type { OperatorChannelConnection } from "./types";

function statusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "active") return "default";
  if (status === "error" || status === "disconnected") return "destructive";
  if (status === "paused" || status === "pending_auth") return "secondary";
  return "outline";
}

export function ChannelsPage() {
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const [connections, setConnections] = useState<OperatorChannelConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      setConnections(await listChannelConnections(tenantId));
    } catch (err) {
      setError(formatChannelApiError(err));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    if (!tenantId || !displayName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createIcalConnection(tenantId, displayName.trim());
      setDialogOpen(false);
      setDisplayName("");
      window.location.href = `/dashboard/channels/${created.connectionId}`;
    } catch (err) {
      setCreateError(formatChannelApiError(err));
    } finally {
      setCreating(false);
    }
  }

  const tenantGate = renderTenantGate({
    loading: tenantLoading,
    error: tenantError,
    tenantId,
  });
  if (tenantGate) return tenantGate;
  if (loading) return <Skeleton className="h-96 w-full" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div>
      <PageHeader
        title="Channels"
        description="Configure iCal feeds that block externally reserved dates. iCal does not create Talos bookings."
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Add iCal connection
          </Button>
        }
      />

      {connections.length === 0 ? (
        <EmptyState
          title="No channel connections"
          description="Create an iCal connection to import external blocked dates."
          action={{ label: "Add iCal connection", onClick: () => setDialogOpen(true) }}
        />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Semantic mode</TableHead>
                <TableHead>Inventory apply</TableHead>
                <TableHead>Health</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {connections.map((c) => (
                <TableRow key={c.connectionId}>
                  <TableCell>
                    <Link
                      href={`/dashboard/channels/${c.connectionId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {c.displayName}
                    </Link>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {c.connectionId}
                    </div>
                  </TableCell>
                  <TableCell className="capitalize">{c.provider}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(c.status)} className="capitalize">
                      {c.status.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{c.semanticMode}</TableCell>
                  <TableCell>
                    {c.inventoryApplyEnabled ? "Enabled" : "Disabled"}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">
                    {c.lastError ? (
                      <span className="text-destructive">{c.lastError}</span>
                    ) : c.hasCredentialRef ? (
                      "Credential present"
                    ) : (
                      "No credential"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create iCal connection</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Talos uses this calendar feed to block externally reserved dates. iCal does
            not create Talos bookings.
          </p>
          <div className="space-y-2">
            <Label htmlFor="ical-display-name">Display name</Label>
            <Input
              id="ical-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Airbnb blocked dates"
            />
          </div>
          {createError ? (
            <p className="text-sm text-destructive">{createError}</p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!displayName.trim() || creating}
              onClick={() => void create()}
            >
              {creating ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
