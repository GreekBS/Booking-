"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyBookingFinancialReprice,
  previewBookingFinancialReprice,
} from "@/lib/admin/api";
import type {
  FinancialRepriceApplyRecord,
  FinancialRepricePreviewRecord,
} from "@/lib/admin/types";
import {
  mapFinancialRepriceError,
  type FinancialRepriceErrorKind,
  type FinancialRepriceMappedError,
  FinancialRepriceValidationError,
} from "../lib/financial-reprice-errors";
import {
  normalizeFinancialRepriceReason,
  validateFinancialRepriceReason,
} from "../lib/financial-reprice-reason";

export type FinancialRepriceStatus =
  | "idle"
  | "previewing"
  | "preview_ready"
  | "applying"
  | "success"
  | "error";

/** Committed booking stay geometry — never unsaved stay-draft values. */
export interface FinancialRepriceCommittedStay {
  bookingId: string;
  unitId: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  /** Invalidates an in-memory preview when the booking quote changes. */
  quoteId: string;
}

/** Preview payload safe for UI — confirmation token is never exposed. */
export type FinancialRepricePreviewView = Omit<
  FinancialRepricePreviewRecord,
  "confirmationToken"
>;

export interface UseBookingFinancialRepriceOptions {
  tenantId: string | null | undefined;
  committedStay: FinancialRepriceCommittedStay | null;
}

interface PreviewBinding {
  fingerprint: string;
  reason: string;
  confirmationToken: string;
  confirmationExpiresAt: string;
  previewView: FinancialRepricePreviewView;
  /**
   * Set once an apply HTTP call has been sent. Ambiguous retry must not be
   * blocked by client-side expiry after that point — the server may already
   * have committed and can still return an idempotent replay while the token
   * signature verifies.
   */
  applyAttempted: boolean;
}

function stayFingerprint(stay: FinancialRepriceCommittedStay): string {
  return [
    stay.bookingId,
    stay.unitId,
    stay.checkIn,
    stay.checkOut,
    String(stay.guestCount),
    stay.quoteId,
  ].join("|");
}

export function buildFinancialRepriceFingerprint(
  stay: FinancialRepriceCommittedStay,
  reason: string,
): string {
  return `${stayFingerprint(stay)}|${normalizeFinancialRepriceReason(reason)}`;
}

export function isFinancialRepriceConfirmationExpired(
  confirmationExpiresAt: string,
  nowMs: number = Date.now(),
): boolean {
  const expiresAt = Date.parse(confirmationExpiresAt);
  if (Number.isNaN(expiresAt)) return true;
  return nowMs >= expiresAt;
}

function toPreviewView(
  record: FinancialRepricePreviewRecord,
): FinancialRepricePreviewView {
  const { confirmationToken: _token, ...view } = record;
  void _token;
  return view;
}

/**
 * BFS-4 Phase 1 — financial reprice preview/apply state machine.
 * Keeps confirmation tokens in React memory only; never auto-applies.
 */
export function useBookingFinancialReprice({
  tenantId,
  committedStay,
}: UseBookingFinancialRepriceOptions) {
  const [status, setStatus] = useState<FinancialRepriceStatus>("idle");
  const [reason, setReasonState] = useState("");
  const [preview, setPreview] = useState<FinancialRepricePreviewView | null>(
    null,
  );
  const [applyResult, setApplyResult] =
    useState<FinancialRepriceApplyRecord | null>(null);
  const [error, setError] = useState<FinancialRepriceMappedError | null>(null);

  const bindingRef = useRef<PreviewBinding | null>(null);
  const previewRequestIdRef = useRef(0);
  const applyRequestIdRef = useRef(0);
  const previewInFlightRef = useRef(false);
  const applyInFlightRef = useRef(false);
  const mountedRef = useRef(true);

  const clearSensitiveState = useCallback(() => {
    bindingRef.current = null;
    setPreview(null);
  }, []);

  const resetWorkflow = useCallback(() => {
    previewRequestIdRef.current += 1;
    applyRequestIdRef.current += 1;
    previewInFlightRef.current = false;
    applyInFlightRef.current = false;
    clearSensitiveState();
    setStatus("idle");
    setReasonState("");
    setApplyResult(null);
    setError(null);
  }, [clearSensitiveState]);

  const invalidatePreview = useCallback(
    (nextStatus: FinancialRepriceStatus = "idle") => {
      previewRequestIdRef.current += 1;
      clearSensitiveState();
      setApplyResult(null);
      if (nextStatus !== "error") {
        setError(null);
      }
      setStatus(nextStatus);
    },
    [clearSensitiveState],
  );

  // Booking switch / unmount cleanup — never leave tokens behind.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      bindingRef.current = null;
      previewRequestIdRef.current += 1;
      applyRequestIdRef.current += 1;
      previewInFlightRef.current = false;
      applyInFlightRef.current = false;
    };
  }, []);

  const bookingId = committedStay?.bookingId ?? null;
  // Booking or tenant switch must drop any in-memory confirmation token.
  useEffect(() => {
    resetWorkflow();
  }, [bookingId, tenantId, resetWorkflow]);

  // Invalidate when committed stay or reason diverges from the bound preview.
  useEffect(() => {
    const binding = bindingRef.current;
    if (!binding || !committedStay) return;
    const current = buildFinancialRepriceFingerprint(committedStay, reason);
    if (current !== binding.fingerprint) {
      invalidatePreview("idle");
    }
  }, [
    committedStay,
    committedStay?.bookingId,
    committedStay?.unitId,
    committedStay?.checkIn,
    committedStay?.checkOut,
    committedStay?.guestCount,
    committedStay?.quoteId,
    reason,
    invalidatePreview,
  ]);

  const setReason = useCallback((value: string) => {
    setReasonState(value);
  }, []);

  const requestPreview = useCallback(async () => {
    if (!tenantId || !committedStay) {
      const mapped = mapFinancialRepriceError(
        new FinancialRepriceValidationError(
          "Δεν υπάρχουν διαθέσιμα στοιχεία κράτησης για προεπισκόπηση.",
        ),
      );
      setError(mapped);
      setStatus("error");
      return;
    }
    if (
      previewInFlightRef.current ||
      applyInFlightRef.current ||
      status === "previewing" ||
      status === "applying"
    ) {
      return;
    }

    let normalizedReason: string;
    try {
      normalizedReason = validateFinancialRepriceReason(reason);
    } catch (err) {
      const mapped = mapFinancialRepriceError(err);
      setError(mapped);
      setStatus("error");
      clearSensitiveState();
      return;
    }

    const requestId = ++previewRequestIdRef.current;
    previewInFlightRef.current = true;
    clearSensitiveState();
    setApplyResult(null);
    setError(null);
    setStatus("previewing");

    try {
      const result = await previewBookingFinancialReprice(
        tenantId,
        committedStay.bookingId,
        {
          unitId: committedStay.unitId,
          checkIn: committedStay.checkIn,
          checkOut: committedStay.checkOut,
          guestCount: committedStay.guestCount,
          reason: normalizedReason,
        },
      );

      if (!mountedRef.current || requestId !== previewRequestIdRef.current) {
        return;
      }

      if (!result.available || !result.proposed || !result.confirmationToken) {
        const mapped = mapFinancialRepriceError(
          new Error(
            result.reasons[0]?.message ??
              "Stay is not available for financial reprice preview",
          ),
        );
        setError(mapped);
        setStatus("error");
        clearSensitiveState();
        return;
      }

      const view = toPreviewView(result);
      bindingRef.current = {
        fingerprint: buildFinancialRepriceFingerprint(
          committedStay,
          normalizedReason,
        ),
        reason: normalizedReason,
        confirmationToken: result.confirmationToken,
        confirmationExpiresAt: result.confirmationExpiresAt,
        previewView: view,
        applyAttempted: false,
      };
      setReasonState(normalizedReason);
      setPreview(view);
      setStatus("preview_ready");
    } catch (err) {
      if (!mountedRef.current || requestId !== previewRequestIdRef.current) {
        return;
      }
      const mapped = mapFinancialRepriceError(err);
      // Preview never creates an apply-retryable token binding.
      setError({
        ...mapped,
        retryableWithSameToken: false,
        requiresNewPreview: true,
      });
      setStatus("error");
      clearSensitiveState();
    } finally {
      if (requestId === previewRequestIdRef.current) {
        previewInFlightRef.current = false;
      }
    }
  }, [tenantId, committedStay, status, reason, clearSensitiveState]);

  const runApply = useCallback(async () => {
    if (!tenantId || !committedStay) return;
    // Claim the in-flight lock immediately to defeat double-clicks / concurrent calls.
    if (applyInFlightRef.current) return;
    applyInFlightRef.current = true;

    const binding = bindingRef.current;
    if (!binding) {
      applyInFlightRef.current = false;
      const mapped = mapFinancialRepriceError(
        new FinancialRepriceValidationError(
          "Δεν υπάρχει ενεργή προεπισκόπηση για επιβεβαίωση.",
        ),
      );
      setError(mapped);
      setStatus("error");
      return;
    }

    const currentFingerprint = buildFinancialRepriceFingerprint(
      committedStay,
      reason,
    );
    if (currentFingerprint !== binding.fingerprint) {
      applyInFlightRef.current = false;
      invalidatePreview("idle");
      const mapped = mapFinancialRepriceError(
        new FinancialRepriceValidationError(
          "Η προεπισκόπηση δεν ισχύει πλέον. Ζητήστε νέα προεπισκόπηση.",
        ),
      );
      setError(mapped);
      setStatus("error");
      return;
    }

    // First confirm: honor client expiry. After an apply was already sent,
    // skip client expiry so ambiguous recovery can still hit server replay
    // while the token signature remains valid.
    if (
      !binding.applyAttempted &&
      isFinancialRepriceConfirmationExpired(binding.confirmationExpiresAt)
    ) {
      applyInFlightRef.current = false;
      clearSensitiveState();
      const mapped = mapFinancialRepriceError(
        new Error("Confirmation token is invalid or expired"),
      );
      setError(mapped);
      setStatus("error");
      return;
    }

    const applyRequestId = ++applyRequestIdRef.current;
    const applyBookingId = committedStay.bookingId;
    const token = binding.confirmationToken;
    const applyReason = binding.reason;
    binding.applyAttempted = true;

    setStatus("applying");
    setError(null);

    try {
      const result = await applyBookingFinancialReprice(
        tenantId,
        applyBookingId,
        {
          confirmationToken: token,
          reason: applyReason,
        },
      );

      if (
        !mountedRef.current ||
        applyRequestId !== applyRequestIdRef.current
      ) {
        return;
      }

      // Success and idempotent replay are both terminal success.
      clearSensitiveState();
      setApplyResult(result);
      setStatus("success");
      setError(null);
    } catch (err) {
      if (
        !mountedRef.current ||
        applyRequestId !== applyRequestIdRef.current
      ) {
        return;
      }
      const mapped = mapFinancialRepriceError(err);
      setError(mapped);
      setStatus("error");
      if (mapped.requiresNewPreview || !mapped.retryableWithSameToken) {
        clearSensitiveState();
      }
      // Ambiguous network: keep binding.confirmationToken for safe retry.
    } finally {
      if (applyRequestId === applyRequestIdRef.current) {
        applyInFlightRef.current = false;
      }
    }
  }, [tenantId, committedStay, reason, clearSensitiveState, invalidatePreview]);

  /** Explicit operator confirmation — never invoked automatically after preview. */
  const confirmApply = useCallback(async () => {
    if (status !== "preview_ready") return;
    await runApply();
  }, [status, runApply]);

  /**
   * Retry apply with the same in-memory token after an ambiguous network failure.
   * Does not request a new preview / token.
   */
  const retryApply = useCallback(async () => {
    if (status !== "error") return;
    if (!error?.retryableWithSameToken) return;
    if (!bindingRef.current) return;
    await runApply();
  }, [status, error, runApply]);

  const canPreview =
    Boolean(tenantId && committedStay) &&
    status !== "previewing" &&
    status !== "applying";

  const canConfirmApply =
    status === "preview_ready" &&
    Boolean(bindingRef.current) &&
    !applyInFlightRef.current;

  const canRetryApply =
    status === "error" &&
    Boolean(error?.retryableWithSameToken) &&
    Boolean(bindingRef.current) &&
    !applyInFlightRef.current;

  return {
    status,
    reason,
    setReason,
    preview,
    applyResult,
    error,
    errorKind: (error?.kind ?? null) as FinancialRepriceErrorKind | null,
    canPreview,
    canConfirmApply,
    canRetryApply,
    isBusy: status === "previewing" || status === "applying",
    requestPreview,
    confirmApply,
    retryApply,
    reset: resetWorkflow,
  };
}
