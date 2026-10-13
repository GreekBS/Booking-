import { formatOperatorDateTime } from "@/lib/admin/money-presentation";

/** Platform-admin human-readable timestamps — DD/MM/YYYY, HH:mm. */
export function formatPlatformDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const iso = value instanceof Date ? value.toISOString() : String(value);
  return formatOperatorDateTime(iso);
}

export function statusBadgeClass(status: string): string {
  switch (status) {
    case "active":
    case "completed":
    case "SUCCESS":
      return "bg-emerald-100 text-emerald-900";
    case "error":
    case "failed":
    case "dead_letter":
    case "INTERNAL_ERROR":
    case "PROVIDER_ERROR":
      return "bg-red-100 text-red-900";
    case "processing":
    case "pending":
    case "received":
    case "pending_auth":
      return "bg-amber-100 text-amber-900";
    case "paused":
    case "cancelled":
    case "skipped":
    case "duplicate":
    case "disconnected":
      return "bg-[var(--platform-muted-bg)] text-[var(--platform-ink-soft)]";
    default:
      return "bg-[var(--platform-muted-bg)] text-[var(--platform-ink-soft)]";
  }
}
