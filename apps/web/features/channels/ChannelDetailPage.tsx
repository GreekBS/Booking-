"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { renderTenantGate, useTenant } from "@/hooks/use-tenant";
import { fetchAllProperties } from "@/lib/admin/api";
import type { PropertyRecord } from "@/lib/admin/types";
import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/admin/error-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  activateChannelConnection,
  deactivateConnectionInventory,
  disableInventoryApply,
  enableInventoryApply,
  enqueueManualPoll,
  formatChannelApiError,
  getChannelConnection,
  getChannelHealth,
  listChannelMappings,
  pauseChannelConnection,
  putIcalFeedCredentials,
  resumeChannelConnection,
  rotateIcalFeedCredentials,
  setAvailabilityBlockFeedMode,
  upsertChannelMapping,
  disconnectChannelConnection,
} from "./channel-api";
import type {
  ChannelConnectionHealth,
  OperatorChannelConnection,
  OperatorChannelMapping,
} from "./types";

type Props = { connectionId: string };

type ConfirmKind = "disconnect" | "deactivate_inventory" | null;

function Section({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          <span className="mr-2 text-muted-foreground">{step}.</span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

export function ChannelDetailPage({ connectionId }: Props) {
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const [connection, setConnection] = useState<OperatorChannelConnection | null>(null);
  const [health, setHealth] = useState<ChannelConnectionHealth | null>(null);
  const [mappings, setMappings] = useState<OperatorChannelMapping[]>([]);
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [feedUrl, setFeedUrl] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [externalListingId, setExternalListingId] = useState("");
  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null);

  const activeMapping = useMemo(
    () => mappings.find((m) => m.status === "active") ?? mappings[0] ?? null,
    [mappings],
  );

  const selectedProperty = properties.find((p) => p.id === propertyId);
  const units = selectedProperty?.units ?? [];

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [conn, maps, props] = await Promise.all([
        getChannelConnection(tenantId, connectionId),
        listChannelMappings(tenantId, connectionId),
        fetchAllProperties(tenantId),
      ]);
      setConnection(conn);
      setMappings(maps);
      setProperties(props.data ?? []);

      const active = maps.find((m) => m.status === "active") ?? maps[0];
      if (active) {
        setPropertyId(active.propertyId);
        setUnitId(active.unitId);
        setExternalListingId(active.externalListingId);
      }

      try {
        setHealth(await getChannelHealth(tenantId, connectionId));
      } catch {
        setHealth(null);
      }
    } catch (err) {
      setError(formatChannelApiError(err));
    } finally {
      setLoading(false);
    }
  }, [tenantId, connectionId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(fn: () => Promise<void>) {
    if (!tenantId || !connection) return;
    setBusy(true);
    setActionError(null);
    setActionMessage(null);
    try {
      await fn();
      setFeedUrl("");
      await load();
    } catch (err) {
      setActionError(formatChannelApiError(err));
    } finally {
      setBusy(false);
    }
  }

  const tenantGate = renderTenantGate({
    loading: tenantLoading,
    error: tenantError,
    tenantId,
  });
  if (tenantGate) return tenantGate;
  if (loading) return <Skeleton className="h-96 w-full" />;
  if (error || !connection) {
    return (
      <ErrorState
        message={error ?? "Connection not found"}
        onRetry={() => void load()}
      />
    );
  }

  const version = connection.semanticConfigVersion;
  const canAttachCredential =
    connection.status === "draft" ||
    connection.status === "error" ||
    connection.status === "pending_auth";
  const canRotateCredential =
    connection.status === "active" || connection.status === "paused";
  const canActivate =
    connection.status === "pending_auth" || connection.status === "error";
  const canMap =
    connection.status === "active" || connection.status === "paused";

  return (
    <div className="space-y-5">
      <PageHeader
        title={connection.displayName}
        description="Connection → Feed → Semantic → Activation → Mapping → Inventory Apply → Poll / Health"
        actions={
          <Button variant="outline" asChild>
            <Link href="/dashboard/channels">Back to channels</Link>
          </Button>
        }
      />

      <p className="rounded-md border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        Talos uses this calendar feed to block externally reserved dates. iCal does not
        create Talos bookings.
      </p>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge className="capitalize">{connection.status.replace(/_/g, " ")}</Badge>
        <span className="text-muted-foreground">{connection.provider}</span>
        <span className="font-mono text-xs text-muted-foreground">
          v{connection.semanticConfigVersion}
        </span>
        <span className="text-xs text-muted-foreground">
          Inventory apply: {connection.inventoryApplyEnabled ? "enabled" : "disabled"}
        </span>
        <span className="text-xs text-muted-foreground">
          Credential: {connection.hasCredentialRef ? "present (opaque)" : "none"}
        </span>
      </div>

      {connection.lastError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {connection.lastError}
        </p>
      ) : null}

      {actionError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {actionError}
        </p>
      ) : null}
      {actionMessage ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {actionMessage}
        </p>
      ) : null}

      <Section step={1} title="Connection">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Connection ID</dt>
            <dd className="font-mono text-xs">{connection.connectionId}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Semantic mode</dt>
            <dd>{connection.semanticMode}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Updated</dt>
            <dd>{new Date(connection.updatedAt).toLocaleString()}</dd>
          </div>
        </dl>
      </Section>

      <Section step={2} title="Feed">
        <p className="text-sm text-muted-foreground">
          Enter the HTTPS iCal feed URL. After save, Talos stores it in the credential
          vault and never displays the stored URL again.
        </p>
        <div className="space-y-2">
          <Label htmlFor="feed-url">iCal feed URL</Label>
          <Input
            id="feed-url"
            type="url"
            autoComplete="off"
            value={feedUrl}
            onChange={(e) => setFeedUrl(e.target.value)}
            placeholder="https://…"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {canAttachCredential ? (
            <Button
              disabled={busy || !feedUrl.trim()}
              onClick={() =>
                void runAction(async () => {
                  await putIcalFeedCredentials(tenantId!, connectionId, feedUrl.trim());
                  setActionMessage("Feed credential saved (opaque reference only).");
                })
              }
            >
              Save feed URL
            </Button>
          ) : null}
          {canRotateCredential ? (
            <Button
              variant="secondary"
              disabled={busy || !feedUrl.trim()}
              onClick={() =>
                void runAction(async () => {
                  await rotateIcalFeedCredentials(
                    tenantId!,
                    connectionId,
                    feedUrl.trim(),
                    version,
                  );
                  setActionMessage(
                    "Feed rotated. Connection is paused — resume when ready, then poll.",
                  );
                })
              }
            >
              Rotate feed URL
            </Button>
          ) : null}
        </div>
      </Section>

      <Section step={3} title="Semantic mode">
        <p className="text-sm text-muted-foreground">
          Pilot mode must be <code className="text-xs">availability_block_feed</code>.
        </p>
        {connection.semanticMode === "availability_block_feed" ? (
          <p className="text-sm text-emerald-800">Already set to availability_block_feed.</p>
        ) : (
          <Button
            disabled={busy || connection.status === "disconnected"}
            onClick={() =>
              void runAction(async () => {
                await setAvailabilityBlockFeedMode(
                  tenantId!,
                  connectionId,
                  version,
                  connection.semanticMode,
                );
                setActionMessage("Semantic mode set to availability_block_feed.");
              })
            }
          >
            Set availability_block_feed
          </Button>
        )}
      </Section>

      <Section step={4} title="Activation">
        <div className="flex flex-wrap gap-2">
          {canActivate ? (
            <Button
              disabled={busy || !connection.hasCredentialRef}
              onClick={() =>
                void runAction(async () => {
                  await activateChannelConnection(tenantId!, connectionId, version);
                  setActionMessage("Connection activated.");
                })
              }
            >
              Activate
            </Button>
          ) : null}
          {connection.status === "active" ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void runAction(async () => {
                  await pauseChannelConnection(tenantId!, connectionId, version);
                  setActionMessage("Connection paused.");
                })
              }
            >
              Pause
            </Button>
          ) : null}
          {connection.status === "paused" ? (
            <Button
              disabled={busy}
              onClick={() =>
                void runAction(async () => {
                  await resumeChannelConnection(tenantId!, connectionId, version);
                  setActionMessage("Connection resumed.");
                })
              }
            >
              Resume
            </Button>
          ) : null}
        </div>
        {!connection.hasCredentialRef ? (
          <p className="text-xs text-muted-foreground">Save a feed URL before activating.</p>
        ) : null}
        {connection.status === "draft" ? (
          <p className="text-xs text-muted-foreground">
            Save credentials first to move into pending auth, then activate.
          </p>
        ) : null}
      </Section>

      <Section step={5} title="Mapping">
        <p className="text-sm text-muted-foreground">
          Map the feed to one property unit. Mapping requires an active or paused
          connection. Unit reassignment requires pause first.
        </p>
        {!canMap ? (
          <p className="text-sm text-amber-800">Activate the connection before mapping.</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Property</Label>
                <Select
                  value={propertyId}
                  onValueChange={(v) => {
                    setPropertyId(v);
                    setUnitId("");
                  }}
                >
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
                <Label>Unit</Label>
                <Select value={unitId} onValueChange={setUnitId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="external-listing">External listing id</Label>
              <Input
                id="external-listing"
                value={externalListingId}
                onChange={(e) => setExternalListingId(e.target.value)}
                placeholder="Defaults to selected unit id"
              />
            </div>
            {activeMapping ? (
              <p className="text-xs text-muted-foreground">
                Current mapping: {activeMapping.propertyId} / {activeMapping.unitId} (
                {activeMapping.status})
              </p>
            ) : null}
            <Button
              disabled={busy || !propertyId || !unitId}
              onClick={() =>
                void runAction(async () => {
                  const listingId = externalListingId.trim() || unitId;
                  await upsertChannelMapping(tenantId!, connectionId, {
                    mappingId: activeMapping?.mappingId,
                    externalListingId: listingId,
                    propertyId,
                    unitId,
                    expectedSemanticConfigVersion: version,
                  });
                  setActionMessage("Listing mapping saved.");
                })
              }
            >
              {activeMapping ? "Update mapping" : "Create mapping"}
            </Button>
          </>
        )}
      </Section>

      <Section step={6} title="Inventory apply">
        <p className="text-sm text-muted-foreground">
          Enables writing imported blocks as channel_import inventory for this connection.
          Global env flag CHANNELS_INVENTORY_APPLY_ENABLED must also be on.
        </p>
        <div className="flex flex-wrap gap-2">
          {!connection.inventoryApplyEnabled ? (
            <Button
              disabled={busy || connection.status === "disconnected"}
              onClick={() =>
                void runAction(async () => {
                  await enableInventoryApply(tenantId!, connectionId, version);
                  setActionMessage("Inventory apply enabled for this connection.");
                })
              }
            >
              Enable inventory apply
            </Button>
          ) : (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void runAction(async () => {
                  await disableInventoryApply(tenantId!, connectionId, version);
                  setActionMessage("Inventory apply disabled for this connection.");
                })
              }
            >
              Disable inventory apply
            </Button>
          )}
        </div>
      </Section>

      <Section step={7} title="Poll / Health">
        <Button
          disabled={busy || connection.status !== "active"}
          onClick={() =>
            void runAction(async () => {
              const queued = await enqueueManualPoll(tenantId!, connectionId);
              setActionMessage(
                `Poll queued (job ${queued.jobId}, status ${queued.jobStatus}).`,
              );
            })
          }
        >
          Trigger manual poll
        </Button>
        {connection.status !== "active" ? (
          <p className="text-xs text-muted-foreground">
            Manual poll requires an active connection and CHANNELS_POLLING_ENABLED.
          </p>
        ) : null}

        {health ? (
          <dl className="mt-3 grid gap-2 rounded-md border p-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Pilot eligible</dt>
              <dd>{health.pilotEligible ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Needs attention</dt>
              <dd>{health.needsAttention ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Active mappings</dt>
              <dd>{health.activeMappingCount}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Active channel_import blocks</dt>
              <dd>{health.activeChannelImportCount}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Inventory apply effective</dt>
              <dd>{health.inventoryApplyEffective ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Cursor updated</dt>
              <dd>
                {health.cursorUpdatedAt
                  ? new Date(health.cursorUpdatedAt).toLocaleString()
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Latest poll job</dt>
              <dd>
                {health.latestPollJob
                  ? `${health.latestPollJob.status}${
                      health.latestPollJob.completedAt
                        ? ` @ ${new Date(health.latestPollJob.completedAt).toLocaleString()}`
                        : ""
                    }`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Attention reasons</dt>
              <dd className="text-xs">
                {health.attentionReasons.length
                  ? health.attentionReasons.join(", ")
                  : "—"}
              </dd>
            </div>
            {!health.pilotEligible && health.pilotEligibilityReasons.length > 0 ? (
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Pilot eligibility blockers</dt>
                <dd className="text-xs">{health.pilotEligibilityReasons.join(", ")}</dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Health unavailable.</p>
        )}
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void load()}>
          Refresh
        </Button>
      </Section>

      <Section step={8} title="Safe teardown">
        <p className="text-sm text-muted-foreground">
          Disconnect releases connection-owned channel_import blocks. Inventory
          deactivate pauses (if active) and releases imported inventory without
          changing disconnect semantics.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="destructive"
            disabled={busy || connection.status === "disconnected"}
            onClick={() => setConfirmKind("disconnect")}
          >
            Disconnect
          </Button>
          <Button
            variant="outline"
            disabled={busy || connection.status === "disconnected"}
            onClick={() => setConfirmKind("deactivate_inventory")}
          >
            Deactivate imported inventory
          </Button>
        </div>
      </Section>

      <AlertDialog
        open={confirmKind != null}
        onOpenChange={(open) => {
          if (!open) setConfirmKind(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmKind === "disconnect"
                ? "Disconnect this connection?"
                : "Deactivate imported inventory?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmKind === "disconnect"
                ? "This disconnects the connection and releases all connection-owned channel_import blocks. Hold/Booking inventory is not released."
                : "This releases all active channel_import blocks for the connection and pauses if currently active. Hold/Booking inventory is not released."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                void runAction(async () => {
                  if (confirmKind === "disconnect") {
                    await disconnectChannelConnection(tenantId!, connectionId, version);
                    setActionMessage("Connection disconnected.");
                  } else if (confirmKind === "deactivate_inventory") {
                    await deactivateConnectionInventory(tenantId!, connectionId, version);
                    setActionMessage("Imported inventory deactivated.");
                  }
                  setConfirmKind(null);
                })
              }
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
