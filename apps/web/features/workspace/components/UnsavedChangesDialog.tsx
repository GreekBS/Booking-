"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "../context/WorkspaceContext";

export function UnsavedChangesDialog() {
  const { unsavedDialogOpen, sessionStatus, editorCanSave, confirmSave, confirmDiscard, cancelNavigation } =
    useWorkspace();

  const saveDisabled = sessionStatus === "saving" || !editorCanSave;

  return (
    <AlertDialog
      open={unsavedDialogOpen}
      onOpenChange={(open) => {
        if (!open) cancelNavigation();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes. Save them before leaving, or discard your changes.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel onClick={cancelNavigation}>Cancel</AlertDialogCancel>
          <Button type="button" variant="outline" onClick={confirmDiscard}>
            Discard
          </Button>
          <AlertDialogAction disabled={saveDisabled} onClick={() => void confirmSave()}>
            Save
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
