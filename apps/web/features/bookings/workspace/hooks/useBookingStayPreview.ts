"use client";

import { useEffect, useRef, useState } from "react";
import { useTenant } from "@/hooks/use-tenant";
import { previewBookingStayChange } from "@/lib/admin/api";
import type { StayChangePreviewRecord } from "@/lib/admin/types";
import type { StayDraft } from "./useBookingStayDraft";

const PREVIEW_DEBOUNCE_MS = 400;

export function useBookingStayPreview(
  bookingId: string,
  draft: StayDraft | null,
  isDirty: boolean,
) {
  const { tenantId } = useTenant();
  const [preview, setPreview] = useState<StayChangePreviewRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!tenantId || !draft || !isDirty) {
      setPreview(null);
      setError(null);
      setLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);

      void previewBookingStayChange(tenantId, bookingId, draft)
        .then((result) => {
          if (requestId !== requestIdRef.current) return;
          setPreview(result);
        })
        .catch((err) => {
          if (requestId !== requestIdRef.current) return;
          setPreview(null);
          setError(err instanceof Error ? err.message : "Preview failed");
        })
        .finally(() => {
          if (requestId === requestIdRef.current) {
            setLoading(false);
          }
        });
    }, PREVIEW_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [tenantId, bookingId, draft, isDirty]);

  return { preview, loading, error };
}
