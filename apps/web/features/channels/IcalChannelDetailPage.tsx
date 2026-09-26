"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { renderTenantGate, useTenant } from "@/hooks/use-tenant";
import { useActiveProperty } from "@/hooks/use-active-property";
import { fetchAllProperties } from "@/lib/admin/api";
import type { PropertyRecord } from "@/lib/admin/types";
import { PageHeader } from "@/components/admin/page-header";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
import { ErrorState } from "@/components/admin/error-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  channelProviderLabel,
  channelStatusLabel,
} from "@/lib/admin/operator-labels";
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
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Surface>
      <SurfaceHeader title={title} description={description} />
      <div className="space-y-3">{children}</div>
    </Surface>
  );
}

export function IcalChannelDetailPage({ connectionId }: Props) {
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const { propertyId: activePropertyId } = useActiveProperty();
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

  // Default mapping form to global active property when empty (keeps connection list tenant-wide).
  useEffect(() => {
    if (propertyId) return;
    if (!activePropertyId) return;
    if (!properties.some((p) => p.id === activePropertyId)) return;
    setPropertyId(activePropertyId);
  }, [propertyId, activePropertyId, properties]);

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
        description="iCal feed — blocks externally reserved dates. Does not create Talos bookings."
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              status={connection.status}
              label={channelStatusLabel(connection.status)}
            />
            <span className="text-xs text-muted-foreground">
              {channelProviderLabel(connection.provider)}
            </span>
            <span className="text-xs text-muted-foreground">
              Feed: {connection.hasCredentialRef ? "connected" : "not set"}
            </span>
            <span className="text-xs text-muted-foreground">
              Inventory sync: {connection.inventoryApplyEnabled ? "on" : "off"}
            </span>
          </div>
        }
        actions={
          <Button variant="outline" asChild>
            <Link href="/dashboard/channels">Back to channels</Link>
          </Button>
        }
      />

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
        <p className="rounded-md border border-success/30 bg-success-subtle px-3 py-2 text-sm text-success">
          {actionMessage}
        </p>
      ) : null}

      <Section title="Feed" description="Paste the HTTPS calendar URL. After save, Talos stores it securely and never shows the URL again.">
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
                  setActionMessage("Feed saved securely.");
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
                    "Feed rotated. Connection is paused — resume when ready, then refresh.",
                  );
                })
              }
            >
              Rotate feed URL
            </Button>
          ) : null}
        </div>
      </Section>

      <Section
        title="Mode"
        description="This pilot uses availability-block mode (blocks dates only)."
      >
        {connection.semanticMode === "availability_block_feed" ? (
          <p className="text-sm text-success">Availability-block mode is active.</p>
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
                setActionMessage("Availability-block mode enabled.");
              })
            }
          >
            Enable availability-block mode
          </Button>
        )}
      </Section>

      <Section title="Connection status" description="Activate after the feed is saved.">
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
            Save the feed first, then activate the connection.
          </p>
        ) : null}
      </Section>

      <Section
        title="Mapped unit"
        description="Map this feed to one unit. Mapping requires an active or paused connection."
      >
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
                  <SelectTrigger aria-label="Mapping property">
                    <SelectValue placeholder="Select property" />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        {p.id === activePropertyId ? " (Active)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  Defaults to Active Property. Change only when mapping a different property.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Select value={unitId} onValueChange={setUnitId}>
                  <SelectTrigger aria-label="Mapped unit">
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
                Current mapping status: {activeMapping.status.replace(/_/g, " ")}
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
                  setActionMessage("Unit mapping saved.");
                })
              }
            >
              {activeMapping ? "Update mapping" : "Create mapping"}
            </Button>
          </>
        )}
      </Section>

      <Section
        title="Inventory synchronization"
        description="When enabled, imported blocked dates write as channel inventory for this connection."
      >
        <div className="flex flex-wrap gap-2">
          {!connection.inventoryApplyEnabled ? (
            <Button
              disabled={busy || connection.status === "disconnected"}
              onClick={() =>
                void runAction(async () => {
                  await enableInventoryApply(tenantId!, connectionId, version);
                  setActionMessage("Inventory synchronization enabled.");
                })
              }
            >
              Enable inventory sync
            </Button>
          ) : (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void runAction(async () => {
                  await disableInventoryApply(tenantId!, connectionId, version);
                  setActionMessage("Inventory synchronization disabled.");
                })
              }
            >
              Disable inventory sync
            </Button>
          )}
        </div>
      </Section>

      <Section title="Refresh & status" description="Pull the latest feed and review connection health.">
        <Button
          disabled={busy || connection.status !== "active"}
          onClick={() =>
            void runAction(async () => {
              const queued = await enqueueManualPoll(tenantId!, connectionId);
              setActionMessage(
                `Refresh queued (${queued.jobStatus}).`,
              );
            })
          }
        >
          Refresh feed now
        </Button>
        {connection.status !== "active" ? (
          <p className="text-xs text-muted-foreground">
            Manual refresh requires an active connection.
          </p>
        ) : null}

        {health ? (
          <div className="mt-3 space-y-2 rounded-md border border-border bg-surface-subtle/40 p-3 text-sm">
            <div className="grid gap-2 sm:grid-cols-2">
              <p>
                <span className="text-muted-foreground">Needs attention: </span>
                {health.needsAttention ? "Yes" : "No"}
              </p>
              <p>
                <span className="text-muted-foreground">Mapped units: </span>
                {health.activeMappingCount}
              </p>
              <p>
                <span className="text-muted-foreground">Imported blocks: </span>
                {health.activeChannelImportCount}
              </p>
              <p>
                <span className="text-muted-foreground">Inventory sync effective: </span>
                {health.inventoryApplyEffective ? "Yes" : "No"}
              </p>
            </div>
            {health.attentionReasons.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {health.attentionReasons.join(" · ")}
              </p>
            ) : null}
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer font-medium text-foreground">
                Advanced diagnostics
              </summary>
              <dl className="mt-2 grid gap-1 sm:grid-cols-2">
                <div>
                  <dt>Last activity</dt>
                  <dd>
                    {health.cursorUpdatedAt
                      ? new Date(health.cursorUpdatedAt).toLocaleString()
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Latest poll</dt>
                  <dd>
                    {health.latestPollJob
                      ? `${health.latestPollJob.status}${
                          health.latestPollJob.completedAt
                            ? ` · ${new Date(health.latestPollJob.completedAt).toLocaleString()}`
                            : ""
                        }`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Pilot eligible</dt>
                  <dd>{health.pilotEligible ? "Yes" : "No"}</dd>
                </div>
                {!health.pilotEligible && health.pilotEligibilityReasons.length > 0 ? (
                  <div className="sm:col-span-2">
                    <dt>Eligibility notes</dt>
                    <dd>{health.pilotEligibilityReasons.join(", ")}</dd>
                  </div>
                ) : null}
              </dl>
            </details>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Health unavailable.</p>
        )}
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void load()}>
          Refresh status
        </Button>
      </Section>

      <Section
        title="Disconnect"
        description="Releases imported calendar blocks for this connection. Hold and booking inventory is not released."
      >
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
            Clear imported blocks
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
                : "Clear imported blocks?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmKind === "disconnect"
                ? "This disconnects the feed and releases imported calendar blocks. Guest bookings and holds are not affected."
                : "This releases imported calendar blocks and pauses if currently active. Guest bookings and holds are not affected."}
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
                    setActionMessage("Imported blocks cleared.");
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
