"use client";

import { useMemo } from "react";
import type { CalendarRecord, OperatorBlockType } from "@/lib/admin/types";
import { OPERATOR_BLOCK_TYPES } from "@/lib/admin/types";
import { nightsBetween } from "@/lib/admin/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/admin/status-badge";
import { elCommon } from "@/lib/i18n";
import { getBarVisualConfig } from "../../lib/bar-styles";
import {
  DrawerActions,
  DrawerDetailList,
  DrawerDetailRow,
  DrawerDivider,
  DrawerSection,
} from "./DrawerPrimitives";

type CalendarBlock = CalendarRecord["blocks"][number];

interface OperatorBlockDrawerProps {
  block: CalendarBlock | null;
  unitLabel?: string;
  propertyLabel?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (block: CalendarBlock) => void;
  onDelete: (block: CalendarBlock) => void;
}

function isOperatorType(blockType: string): blockType is OperatorBlockType {
  return OPERATOR_BLOCK_TYPES.includes(blockType as OperatorBlockType);
}

export function OperatorBlockDrawer({
  block,
  unitLabel,
  propertyLabel,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: OperatorBlockDrawerProps) {
  const visual = useMemo(() => {
    if (!block || !isOperatorType(block.blockType)) {
      return getBarVisualConfig("operator", "manual");
    }
    return getBarVisualConfig("operator", block.blockType);
  }, [block]);

  if (!block) return null;

  const Icon = visual.icon;
  const nights = nightsBetween(block.checkIn, block.checkOut);
  const typeLabel = block.blockType.replace(/_/g, " ");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col overflow-y-auto sm:max-w-md">
        <SheetHeader className="space-y-3 text-left">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${visual.className}`}
            >
              <Icon className={`h-5 w-5 ${visual.iconClassName}`} />
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="capitalize text-lg">{typeLabel} block</SheetTitle>
              <SheetDescription className="mt-1 flex flex-wrap items-center gap-2">
                <StatusBadge status={block.status} />
                {unitLabel && <span>{unitLabel}</span>}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="mt-6 flex-1 space-y-5 pb-24 text-sm">
          <DrawerSection title="Λεπτομέρειες">
            <DrawerDetailList>
              <DrawerDetailRow label="Τύπος" value={<span className="capitalize">{typeLabel}</span>} />
              <DrawerDetailRow label="Αιτία" value={block.reason?.trim() || "—"} />
              <DrawerDetailRow label="Δημιουργήθηκε από" value="Δεν καταγράφηκε" />
              <DrawerDetailRow label="Δημιουργήθηκε" value="Δεν καταγράφηκε" />
            </DrawerDetailList>
          </DrawerSection>

          <DrawerDivider />

          <DrawerSection title="Ημερομηνίες">
            <DrawerDetailList>
              <DrawerDetailRow label={elCommon.checkIn} value={block.checkIn} />
              <DrawerDetailRow label={elCommon.checkOut} value={block.checkOut} />
              <DrawerDetailRow label="Διάρκεια" value={`${nights} ${nights === 1 ? "νύχτα" : "νύχτες"}`} />
            </DrawerDetailList>
          </DrawerSection>

          <DrawerDivider />

          <DrawerSection title="Location">
            <DrawerDetailList>
              <DrawerDetailRow label="Property" value={propertyLabel ?? "—"} />
              <DrawerDetailRow label={elCommon.unit} value={unitLabel ?? "—"} />
              <DrawerDetailRow label="ID block" value={block.id.slice(0, 12)} mono />
            </DrawerDetailList>
          </DrawerSection>
        </div>

        <DrawerActions>
          <Button variant="secondary" onClick={() => onEdit(block)}>
            Επεξεργασία
          </Button>
          <Button variant="destructive" onClick={() => onDelete(block)}>
            Διαγραφή
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Κλείσιμο
          </Button>
        </DrawerActions>
      </SheetContent>
    </Sheet>
  );
}
