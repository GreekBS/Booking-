import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type BadgeVariant =
  | "default"
  | "secondary"
  | "success"
  | "warning"
  | "destructive"
  | "outline"
  | "info";

/**
 * Semantic status → badge mapping for Phase 1 surfaces.
 * Domain status strings are never renamed — only presentation.
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
  // Channels
  paused: "warning",
  error: "destructive",
  disconnected: "destructive",
  pending_auth: "warning",
};

const toneClass: Partial<Record<BadgeVariant, string>> = {
  success: "border-transparent bg-success-subtle text-success",
  warning: "border-transparent bg-warning-subtle text-warning-foreground",
  destructive: "border-transparent bg-danger-subtle text-danger",
  info: "border-transparent bg-info-subtle text-info",
  default: "border-transparent bg-primary-subtle text-primary",
};

interface StatusBadgeProps {
  status: string;
  /** Optional human-readable label; domain `status` still drives the tone. */
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const variant = statusVariant[status] ?? statusVariant[status.toLowerCase()] ?? "outline";
  const display = label ?? status.replace(/_/g, " ");
  return (
    <Badge
      variant={variant === "info" ? "secondary" : variant}
      className={cn(
        "rounded-md px-2 py-0.5 text-[11px] font-medium capitalize",
        toneClass[variant],
        className,
      )}
    >
      {display}
    </Badge>
  );
}
