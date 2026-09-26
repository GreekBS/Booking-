"use client";

import Link from "next/link";
import { StatusBadge } from "@/components/admin/status-badge";
import { Surface } from "@/components/admin/surface";
import { Button } from "@/components/ui/button";
import type { OperatorChannelConnection } from "../types";
import type { BookingComCapabilities, BookingComOperatorPhase } from "./types";

const PHASE_LABEL: Record<BookingComOperatorPhase, string> = {
  not_connected: "Not connected",
  setup_required: "Setup required",
  awaiting_access: "Awaiting access",
  mapping_required: "Mapping required",
  ready_for_sync_preview: "Ready for sync preview",
  ready_to_activate: "Ready to activate",
  connected: "Connected",
  paused: "Paused",
  degraded: "Needs attention",
  disconnected: "Disconnected",
};

function phaseStatusKey(phase: BookingComOperatorPhase): string {
  if (phase === "connected") return "active";
  if (phase === "paused") return "paused";
  if (phase === "degraded" || phase === "disconnected") return "error";
  if (phase === "awaiting_access" || phase === "setup_required") return "pending_auth";
  return "draft";
}

function phaseFromConnection(
  connection: OperatorChannelConnection | null,
  partner: BookingComCapabilities | null,
): BookingComOperatorPhase {
  if (!connection) return "not_connected";
  if (connection.status === "disconnected") return "disconnected";
  if (connection.status === "paused") return "paused";
  if (connection.status === "active") {
    return connection.lastError ? "degraded" : "connected";
  }
  if (partner && !partner.liveConnectivityAvailable && !partner.fixtureTransportEnabled) {
    return "awaiting_access";
  }
  if (connection.status === "draft" || connection.status === "pending_auth") {
    return "setup_required";
  }
  if (connection.status === "error") return "degraded";
  return "setup_required";
}

export function BookingComProviderCard({
  connection,
  partner,
  onStart,
  starting,
}: {
  connection: OperatorChannelConnection | null;
  partner: BookingComCapabilities | null;
  onStart: () => void;
  starting?: boolean;
}) {
  const phase = phaseFromConnection(connection, partner);
  const href = connection
    ? connection.status === "active" || connection.status === "paused"
      ? `/dashboard/channels/${connection.connectionId}`
      : `/dashboard/channels/${connection.connectionId}/setup`
    : "/dashboard/channels/booking-com/setup";

  return (
    <Surface className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Booking.com</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Reservations in · availability, rates &amp; restrictions out
          </p>
        </div>
        <StatusBadge status={phaseStatusKey(phase)} label={PHASE_LABEL[phase]} />
      </div>
      <div className="mt-4 flex flex-1 flex-col space-y-3">
        {partner ? (
          <p
            className="rounded-md border border-border bg-surface-subtle px-3 py-2 text-xs text-muted-foreground"
            role="status"
          >
            {partner.operatorMessage}
          </p>
        ) : null}
        {connection ? (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{connection.displayName}</span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Connect your Booking.com hotel to sync reservations and availability.
          </p>
        )}
        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          {connection ? (
            <Button asChild>
              <Link href={href}>
                {phase === "connected" || phase === "paused" || phase === "degraded"
                  ? "Open dashboard"
                  : "Continue setup"}
              </Link>
            </Button>
          ) : (
            <Button disabled={starting} onClick={onStart}>
              {starting ? "Starting…" : "Connect Booking.com"}
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link href="/dashboard/channels/help/booking-com">Help guide</Link>
          </Button>
        </div>
      </div>
    </Surface>
  );
}

export function ComingSoonProviderCard({
  name,
  description,
}: {
  name: string;
  description: string;
}) {
  return (
    <Surface variant="subtle" className="opacity-90">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold">{name}</h3>
        <StatusBadge status="draft" label="Coming soon" />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </Surface>
  );
}
