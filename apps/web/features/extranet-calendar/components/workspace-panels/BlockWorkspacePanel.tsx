"use client";

import { useMemo, useState } from "react";
import { useTenant } from "@/hooks/use-tenant";
import { releaseOperatorBlock } from "@/lib/admin/api";
import type { OperatorBlockType } from "@/lib/admin/types";
import { OPERATOR_BLOCK_TYPES } from "@/lib/admin/types";
import { nightsBetween } from "@/lib/admin/utils";
import { toastError, toastSuccess } from "@/lib/admin/toast";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getBarVisualConfig } from "@/features/availability/lib/bar-styles";
import {
  DrawerDetailList,
  DrawerDetailRow,
  DrawerDivider,
  DrawerSection,
} from "@/features/availability/components/drawers/DrawerPrimitives";
import { useWorkspace } from "@/features/workspace/context/WorkspaceContext";
import { useCalendarActions } from "../../context/CalendarActionsContext";
import type { WorkspaceBlockTarget } from "../../types";
import { WorkspacePanelActions } from "./WorkspacePanelActions";
import { elCommon } from "@/lib/i18n";

interface BlockWorkspacePanelProps {
  target: WorkspaceBlockTarget;
  active: boolean;
}

export function BlockWorkspacePanel({ target, active }: BlockWorkspacePanelProps) {
  const { tenantId } = useTenant();
  const { closeWorkspace } = useWorkspace();
  const { refreshCalendars } = useCalendarActions();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const visual = useMemo(() => {
    const blockType = OPERATOR_BLOCK_TYPES.includes(target.blockType as OperatorBlockType)
      ? (target.blockType as OperatorBlockType)
      : "manual";
    return getBarVisualConfig("operator", blockType);
  }, [target.blockType]);
  const Icon = visual.icon;
  const nights = nightsBetween(target.checkIn, target.checkOut);
  const typeLabel = target.blockType.replace(/_/g, " ");

  async function handleDelete() {
    if (!tenantId) return;
    setBusy(true);
    try {
      await releaseOperatorBlock(tenantId, target.unitId, target.id);
      toastSuccess("Το block αφαιρέθηκε");
      refreshCalendars();
      closeWorkspace();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Αποτυχία διαγραφής block");
    } finally {
      setBusy(false);
      setDeleteOpen(false);
    }
  }

  if (!active) return null;

  return (
    <>
      <div className="space-y-6 pb-2 text-sm">
        <div>
          <div className="flex items-center gap-2">
            <Icon className={cn("h-4 w-4", visual.iconClassName)} aria-hidden />
            <h3 className="text-sm font-semibold capitalize">{typeLabel} block</h3>
            <StatusBadge status="active" />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{target.unitName}</p>
        </div>

        <DrawerSection title="Λεπτομέρειες">
          <DrawerDetailList>
            <DrawerDetailRow
              label="Τύπος"
              value={<span className="capitalize">{typeLabel}</span>}
            />
            <DrawerDetailRow label="Αιτία" value={target.reason?.trim() || "—"} />
          </DrawerDetailList>
        </DrawerSection>

        <DrawerDivider />

        <DrawerSection title="Ημερομηνίες">
          <DrawerDetailList>
            <DrawerDetailRow label={elCommon.checkIn} value={target.checkIn} />
            <DrawerDetailRow label={elCommon.checkOut} value={target.checkOut} />
            <DrawerDetailRow
              label="Διάρκεια"
              value={`${nights} ${nights === 1 ? "νύχτα" : "νύχτες"}`}
            />
          </DrawerDetailList>
        </DrawerSection>

        <DrawerDivider />

        <DrawerSection title="Location">
          <DrawerDetailList>
            <DrawerDetailRow label="Property" value={target.propertyName} />
            <DrawerDetailRow label="Μονάδα" value={target.unitName} />
            <DrawerDetailRow label="ID block" value={target.id.slice(0, 12)} mono />
          </DrawerDetailList>
        </DrawerSection>
      </div>

      <WorkspacePanelActions>
        <Button size="sm" variant="secondary" disabled title="Η επεξεργασία έρχεται σύντομα">
          Η επεξεργασία έρχεται σύντομα
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={busy}
          onClick={() => setDeleteOpen(true)}
        >
          Απελευθέρωση block
        </Button>
        <Button size="sm" variant="ghost" onClick={closeWorkspace}>
          Κλείσιμο
        </Button>
      </WorkspacePanelActions>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Απελευθέρωση block"
        description="Να αφαιρεθεί το block και να ανοίξουν οι ημερομηνίες στο ημερολόγιο;"
        confirmLabel="Απελευθέρωση"
        destructive
        loading={busy}
        onConfirm={handleDelete}
      />
    </>
  );
}
