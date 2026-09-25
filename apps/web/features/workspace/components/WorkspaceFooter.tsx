"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WorkspaceSessionStatus } from "../lib/workspace-types";
import { useWorkspace } from "../context/WorkspaceContext";

interface WorkspaceFooterProps {
  sessionStatus: WorkspaceSessionStatus;
  onSave?: () => void;
  onCancel?: () => void;
  className?: string;
}

export function WorkspaceFooter({
  sessionStatus,
  onSave,
  onCancel,
  className,
}: WorkspaceFooterProps) {
  const { editorCanSave } = useWorkspace();
  const canSave =
    editorCanSave && (sessionStatus === "dirty" || sessionStatus === "error");
  const saving = sessionStatus === "saving";

  return (
    <div
      className={cn(
        "sticky bottom-0 shrink-0 border-t border-border bg-surface px-4 py-3",
        className,
      )}
    >
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!canSave || saving} onClick={onSave}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="outline" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
