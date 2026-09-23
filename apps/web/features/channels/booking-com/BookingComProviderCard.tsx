"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Booking.com</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Reservations in · availability, rates &amp; restrictions out
            </p>
          </div>
          <Badge
            variant={
              phase === "connected"
                ? "default"
                : phase === "degraded" || phase === "disconnected"
                  ? "destructive"
                  : "secondary"
            }
          >
            {PHASE_LABEL[phase]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="mt-auto space-y-3">
        {partner ? (
          <p
            className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
            role="status"
          >
            {partner.operatorMessage}
          </p>
        ) : null}
        {connection ? (
          <dl className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            <div>
              <dt className="sr-only">Connection</dt>
              <dd className="truncate font-medium text-foreground">{connection.displayName}</dd>
            </div>
            <div>
              <dt className="inline text-muted-foreground">Status: </dt>
              <dd className="inline capitalize">{connection.status.replace(/_/g, " ")}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            Connect your Booking.com hotel to sync reservations and availability.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
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
      </CardContent>
    </Card>
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
    <Card className="opacity-80">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-lg">{name}</CardTitle>
          <Badge variant="outline">Coming later</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
