"use client";

import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export function DrawerSection({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function DrawerDetailRow({
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

export function DrawerDivider() {
  return <Separator className="my-1" />;
}

export function DrawerDetailList({ children }: { children: React.ReactNode }) {
  return <dl className="grid gap-2.5">{children}</dl>;
}

export function DrawerActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-6 mt-6 border-t border-[#d1d5db] bg-white px-6 py-4 dark:border-border dark:bg-background">
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
