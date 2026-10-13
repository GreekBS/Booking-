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
    <section
      className={cn(
        "space-y-3 rounded-[11px] border border-border bg-surface p-4",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold leading-[22px] text-foreground">{title}</h3>
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
    <div className={cn("flex items-start justify-between gap-4 text-[14px] leading-[22px]", className)}>
      <dt className="shrink-0 text-[13px] font-medium leading-[19px] text-[hsl(var(--foreground-muted))]">
        {label}
      </dt>
      <dd
        className={cn(
          "text-right text-foreground",
          mono && "font-mono text-[12px] leading-[18px] text-muted-foreground",
          bold && "text-[20px] font-bold leading-7 tabular-nums tracking-tight",
          !mono && !bold && "text-[14px] font-medium leading-[21px]",
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
