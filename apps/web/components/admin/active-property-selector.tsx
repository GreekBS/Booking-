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

export function ActivePropertySelector() {
  const { property, properties, propertyId, setActiveProperty, ready, error } =
    useActiveProperty();

  if (!ready) {
    return <Skeleton className="hidden h-9 w-[180px] sm:block" />;
  }

  if (error) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="hidden max-w-[220px] sm:inline-flex"
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
        className="hidden max-w-[220px] gap-2 sm:inline-flex"
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
          size="sm"
          className="hidden max-w-[240px] gap-2 sm:inline-flex"
          aria-label="Active property"
        >
          <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">
            {property?.name ?? "Select property"}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Active property</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {properties.map((p) => {
          const selected = p.id === propertyId;
          return (
            <DropdownMenuItem
              key={p.id}
              onSelect={() => setActiveProperty(p.id)}
              className={cn("flex items-start justify-between gap-2", selected && "bg-accent")}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="truncate text-xs text-muted-foreground capitalize">
                  {p.status}
                </p>
              </div>
              {selected ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
