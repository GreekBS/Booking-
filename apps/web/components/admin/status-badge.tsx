import { Badge } from "@/components/ui/badge";
import { statusLabelEl } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type BadgeVariant =
  | "default"
  | "secondary"
  | "success"
  | "warning"
  | "destructive"
  | "outline"
  | "info"
  | "danger";

/**
 * Domain status → semantic badge.
 * Ownership: use StatusBadge for domain status strings (booking, payment, HK, channel, …).
 * Use Badge directly only for non-domain chrome (counts, tags, decorative labels).
 *
 * Interaction/CTA blue (primary) must not be used for success outcomes.
 * DIRTY vs IN_PROGRESS both map to warning today — split in a later HK phase.
 *
 * Typography: text-[11px] retained for UI-0 visual stability; UI-1 raises ≥13px floor
 * (calendar micro-overlays remain an intentional exception elsewhere).
 */
const statusVariant: Record<string, BadgeVariant> = {
  // Inventory / property
  active: "success",
  draft: "secondary",
  inactive: "warning",
  archived: "outline",
  // Bookings
  pending: "warning",
  payment_pending: "warning",
  confirmed: "success",
  completed: "secondary",
  cancelled: "destructive",
  // Holds / inventory ops
  expired: "outline",
  released: "outline",
  manual: "secondary",
  hold: "warning",
  booking: "default",
  // Fiscal
  ISSUED: "success",
  DRAFT: "secondary",
  // Payments
  PENDING: "warning",
  SUCCEEDED: "success",
  FAILED: "destructive",
  CANCELLED: "outline",
  // Tasks
  OPEN: "info",
  IN_PROGRESS: "warning",
  COMPLETED: "success",
  // Housekeeping
  CLEAN: "success",
  DIRTY: "warning",
  // Channels
  paused: "warning",
  error: "destructive",
  disconnected: "destructive",
  pending_auth: "warning",
};

interface StatusBadgeProps {
  status: string;
  /** Optional human-readable label; domain `status` still drives the tone. */
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const variant = statusVariant[status] ?? statusVariant[status.toLowerCase()] ?? "outline";
  const display = label ?? statusLabelEl(status);
  return (
    <Badge
      variant={variant}
      className={cn("rounded-md px-2 py-0.5 text-[11px] font-medium", className)}
    >
      {display}
    </Badge>
  );
}
