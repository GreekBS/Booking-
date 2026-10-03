"use client";

import Link from "next/link";
import { ChevronDown, FileSpreadsheet, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface BookingCreateMenuProps {
  /** Align dropdown content; header uses end, empty-state uses center. */
  align?: "start" | "center" | "end";
  className?: string;
  triggerClassName?: string;
}

/**
 * Shared create-reservation entry: manual booking or CSV import.
 * Additive over the historic direct link to `/dashboard/bookings/new`.
 */
export function BookingCreateMenu({
  align = "end",
  className,
  triggerClassName,
}: BookingCreateMenuProps) {
  return (
    <div className={cn(className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            className={triggerClassName}
            aria-label="Επιλογές νέας κράτησης"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Νέα κράτηση
            <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="min-w-[14rem]">
          <DropdownMenuItem asChild>
            <Link href="/dashboard/bookings/new">
              <Plus className="h-4 w-4" aria-hidden />
              Νέα κράτηση
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/dashboard/bookings/import">
              <FileSpreadsheet className="h-4 w-4" aria-hidden />
              Εισαγωγή από CSV
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
