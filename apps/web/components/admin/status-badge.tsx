import { Badge } from "@/components/ui/badge";

const statusVariant: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  active: "success",
  draft: "secondary",
  inactive: "warning",
  archived: "outline",
  pending: "warning",
  confirmed: "success",
  cancelled: "destructive",
  expired: "outline",
  released: "outline",
  manual: "secondary",
  hold: "warning",
  booking: "default",
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const variant = statusVariant[status] ?? "outline";
  return (
    <Badge variant={variant} className={className}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}
