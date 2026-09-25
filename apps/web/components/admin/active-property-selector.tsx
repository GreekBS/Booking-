"use client";

import { Check, ChevronDown, Building2 } from "lucide-react";
import { useActiveProperty } from "@/hooks/use-active-property";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ActivePropertySelectorProps {
  /** Always visible (mobile header). Default: responsive desktop-oriented. */
  alwaysVisible?: boolean;
  /** Compact trigger for mobile header. */
  compact?: boolean;
  className?: string;
}

/**
 * Workspace property switcher — Active Property is the primary ops context.
 * Semantics unchanged: tenant-scoped session persistence via useActiveProperty.
 */
export function ActivePropertySelector({
  alwaysVisible = false,
  compact = false,
  className,
}: ActivePropertySelectorProps) {
  const { property, properties, propertyId, setActiveProperty, ready, error } =
    useActiveProperty();

  const visibility = alwaysVisible ? "inline-flex" : "hidden sm:inline-flex";

  if (!ready) {
    return (
      <Skeleton
        className={cn(
          alwaysVisible ? "inline-flex" : "hidden sm:block",
          compact ? "h-9 w-[140px]" : "h-10 w-[200px]",
          className,
        )}
      />
    );
  }

  if (error) {
    return (
      <Button
        variant="outline"
        size="sm"
        className={cn(visibility, "max-w-[220px]", className)}
        disabled
      >
        Properties unavailable
      </Button>
    );
  }

  if (properties.length === 0) {
    return (
      <Button
        variant="outline"
        size="sm"
        className={cn(visibility, "max-w-[220px] gap-2", className)}
        disabled
      >
        <Building2 className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">No properties</span>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            visibility,
            "h-auto gap-2 border-border bg-surface shadow-surface hover:bg-surface-subtle",
            compact
              ? "max-w-[min(100%,200px)] px-2.5 py-1.5"
              : "max-w-[280px] px-3 py-2",
            className,
          )}
          aria-label="Active property"
        >
          <span
            className={cn(
              "flex min-w-0 flex-1 flex-col items-start text-left",
              compact && "leading-tight",
            )}
          >
            {!compact && (
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Property
              </span>
            )}
            <span className="flex w-full items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
              <span className="truncate text-sm font-semibold text-foreground">
                {property?.name ?? "Select property"}
              </span>
              <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
            </span>
            {!compact && property?.status ? (
              <span className="truncate pl-5 text-[11px] capitalize text-muted-foreground">
                {property.status.replace(/_/g, " ")}
              </span>
            ) : null}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Active property
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {properties.map((p) => {
          const selected = p.id === propertyId;
          return (
            <DropdownMenuItem
              key={p.id}
              onSelect={() => setActiveProperty(p.id)}
              className={cn(
                "flex items-start justify-between gap-2 py-2",
                selected && "bg-primary-subtle",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="truncate text-xs capitalize text-muted-foreground">
                  {p.status.replace(/_/g, " ")}
                </p>
              </div>
              {selected ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
