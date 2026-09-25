import { Inbox } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: { label: string; onClick?: () => void; href?: string };
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  title,
  description,
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface-subtle/50 text-center",
        compact ? "px-4 py-8" : "px-6 py-12",
        className,
      )}
    >
      <div className="mb-3 rounded-full bg-muted p-2.5">
        <Inbox className="h-5 w-5 text-muted-foreground" aria-hidden />
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground sm:text-sm">{description}</p>
      {action ? (
        <Button
          size="sm"
          className="mt-4"
          onClick={action.onClick}
          asChild={Boolean(action.href)}
        >
          {action.href ? <Link href={action.href}>{action.label}</Link> : action.label}
        </Button>
      ) : null}
    </div>
  );
}
