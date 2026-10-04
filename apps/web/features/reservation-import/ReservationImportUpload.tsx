"use client";

import { useId, useRef } from "react";
import { FileSpreadsheet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  RESERVATION_IMPORT_DRAFT_TTL_AFTER_CREATE,
} from "./reservation-import-copy";

interface ReservationImportUploadProps {
  file: File | null;
  disabled?: boolean;
  error?: string | null;
  maxBytes: number;
  maxRows: number;
  onFileChange: (file: File | null) => void;
}

export function ReservationImportUpload({
  file,
  disabled,
  error,
  maxBytes,
  maxRows,
  onFileChange,
}: ReservationImportUploadProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const maxMb = Math.round(maxBytes / (1024 * 1024));

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor={inputId} className="text-sm font-medium">
          Επιλέξτε αρχείο CSV
        </Label>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
          Μπορείτε να εισαγάγετε πολλές κρατήσεις από το ίδιο αρχείο.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {RESERVATION_IMPORT_DRAFT_TTL_AFTER_CREATE}
        </p>
      </div>

      <div className="rounded-md border border-dashed border-border bg-surface-subtle/60 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="rounded-full bg-muted p-2">
              <FileSpreadsheet className="h-5 w-5 text-muted-foreground" aria-hidden />
            </div>
            <div className="min-w-0 space-y-1">
              {file ? (
                <>
                  <p className="truncate text-sm font-medium text-foreground">
                    {file.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Μόνο αρχεία .csv · έως {maxMb} MB · έως {maxRows} γραμμές · UTF-8
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
            >
              {file ? "Αλλαγή αρχείου" : "Επιλογή αρχείου"}
            </Button>
            {file ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => {
                  if (inputRef.current) inputRef.current.value = "";
                  onFileChange(null);
                }}
              >
                <X className="h-4 w-4" aria-hidden />
                Αφαίρεση
              </Button>
            ) : null}
          </div>
        </div>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          disabled={disabled}
          onChange={(e) => {
            const next = e.target.files?.[0] ?? null;
            onFileChange(next);
          }}
        />
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
