import { cn } from "@/lib/utils";

type SurfaceVariant = "panel" | "metric" | "attention" | "subtle" | "raised";

const variantClass: Record<SurfaceVariant, string> = {
  panel: "border border-border bg-surface shadow-surface",
  metric: "border border-border bg-surface shadow-surface",
  attention: "border border-warning/30 bg-warning-subtle/60 shadow-surface",
  subtle: "border border-border/80 bg-surface-subtle",
  raised: "border border-border bg-surface-raised shadow-raised",
};

interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: SurfaceVariant;
  padding?: "none" | "sm" | "md" | "lg";
}

const paddingClass = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
} as const;

/**
 * Compact operational surface — preferred over identical Card walls.
 */
export function Surface({
  variant = "panel",
  padding = "md",
  className,
  children,
  ...props
}: SurfaceProps) {
  return (
    <div
      className={cn(
        "rounded-lg",
        variantClass[variant],
        paddingClass[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface SurfaceHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function SurfaceHeader({
  title,
  description,
  action,
  className,
}: SurfaceHeaderProps) {
  return (
    <div className={cn("mb-3 flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
