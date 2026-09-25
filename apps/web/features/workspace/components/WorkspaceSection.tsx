"use client";

import { cn } from "@/lib/utils";

export function WorkspaceSection({
  title,
  children,
  className,
  badge,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  badge?: React.ReactNode;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        {badge}
      </div>
      {children}
    </section>
  );
}

export function WorkspaceDetailList({ children }: { children: React.ReactNode }) {
  return <dl className="grid gap-2.5">{children}</dl>;
}

export function WorkspaceDetailRow({
  label,
  value,
  mono,
  bold,
  className,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  bold?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 text-sm", className)}>
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "text-right",
          mono && "font-mono text-xs",
          bold && "font-semibold",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

export function WorkspaceSectionDivider() {
  return <div className="border-t border-border" />;
}
