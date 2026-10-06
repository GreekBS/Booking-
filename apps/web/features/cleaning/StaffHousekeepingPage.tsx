"use client";

import { useCallback, useEffect, useState } from "react";

type StaffContext = {
  propertyId: string;
  propertyName: string;
  locationId: string;
  locationName: string;
  unitId: string | null;
  unitName?: string | null;
  pinConfigured?: boolean;
};

type StatusView = {
  propertyName: string;
  locationName: string;
  unitName: string | null;
  status: "CLEAN" | "DIRTY";
  version: number;
};

function statusLabel(status: "CLEAN" | "DIRTY"): string {
  return status === "CLEAN" ? "Καθαρό" : "Δεν είναι καθαρό";
}

async function readJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
  } & T;
  if (!res.ok) {
    throw new Error(body.error?.message ?? "Αποτυχία αιτήματος");
  }
  return body as T;
}

/**
 * Mobile-first staff housekeeping: PIN → Καθαρό / Δεν είναι καθαρό.
 * No dashboard chrome; no Auth.js operator session.
 */
export function StaffHousekeepingPage({ token }: { token: string }) {
  const [phase, setPhase] = useState<"loading" | "pin" | "ready" | "error">(
    "loading",
  );
  const [context, setContext] = useState<StaffContext | null>(null);
  const [status, setStatus] = useState<StatusView | null>(null);
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const loadStatus = useCallback(async () => {
    const res = await fetch("/api/public/v1/housekeeping/status", {
      method: "GET",
      credentials: "same-origin",
    });
    if (res.status === 401 || res.status === 403) {
      setPhase("pin");
      return;
    }
    const data = await readJson<StatusView>(res);
    setStatus(data);
    setPhase("ready");
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/public/v1/housekeeping/qr/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await readJson<{
          route: { kind: string };
          context: StaffContext;
        }>(res);
        if (cancelled) return;
        setContext(data.context);
        // /staff always shows PIN (or resumes capability) — never auto-redirect.
        try {
          await loadStatus();
        } catch {
          if (!cancelled) setPhase("pin");
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Ο κωδικός QR δεν αναγνωρίζεται",
          );
          setPhase("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, loadStatus]);

  async function onUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/public/v1/housekeeping/staff/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ token, pin }),
      });
      await readJson<{ ok: true }>(res);
      setPin("");
      await loadStatus();
      setMessage("Πρόσβαση επιτυχής");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Λάθος PIN");
      setPhase("pin");
    } finally {
      setPending(false);
    }
  }

  async function mark(target: "CLEAN" | "DIRTY") {
    if (pending || !status) return;
    setPending(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/public/v1/housekeeping/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          target,
          expectedVersion: status.version,
        }),
      });
      const data = await readJson<StatusView>(res);
      setStatus(data);
      setMessage(
        target === "CLEAN"
          ? "Καταχωρήθηκε ως καθαρό"
          : "Καταχωρήθηκε ως μη καθαρό",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία ενημέρωσης");
      try {
        await loadStatus();
      } catch {
        setPhase("pin");
      }
    } finally {
      setPending(false);
    }
  }

  if (phase === "loading") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md items-center justify-center p-6">
        <p className="text-base text-neutral-600">Φόρτωση…</p>
      </main>
    );
  }

  if (phase === "error") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 p-6">
        <h1 className="text-xl font-semibold">Μη έγκυρος κωδικός</h1>
        <p className="text-neutral-600">{error}</p>
      </main>
    );
  }

  if (phase === "pin") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
        <div>
          <p className="text-sm uppercase tracking-wide text-neutral-500">
            Προσωπικό καθαριότητας
          </p>
          <h1 className="mt-1 text-2xl font-semibold">
            {context?.propertyName ?? "Κατάλυμα"}
          </h1>
          <p className="mt-1 text-lg text-neutral-700">
            {context?.locationName ?? "Χώρος"}
          </p>
        </div>
        {context && context.pinConfigured === false ? (
          <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
            Δεν έχει οριστεί PIN προσωπικού. Ζητήστε από τον διαχειριστή να το
            ρυθμίσει στο Talos.
          </p>
        ) : null}
        <form onSubmit={onUnlock} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">PIN προσωπικού</span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{4,8}"
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
              className="h-14 rounded-lg border border-neutral-300 px-4 text-2xl tracking-widest"
              disabled={pending}
              required
            />
          </label>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={pending || pin.length < 4}
            className="h-14 rounded-lg bg-neutral-900 text-lg font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Έλεγχος…" : "Συνέχεια"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {status?.propertyName ?? context?.propertyName}
        </h1>
        <p className="mt-1 text-lg text-neutral-700">
          {status?.unitName || status?.locationName || context?.locationName}
        </p>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
        <p className="text-sm text-neutral-500">Τρέχουσα κατάσταση</p>
        <p className="mt-1 text-2xl font-semibold">
          {status ? statusLabel(status.status) : "—"}
        </p>
      </div>

      {message ? (
        <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">
          {message}
        </p>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="mt-auto flex flex-col gap-3 pb-8">
        <button
          type="button"
          disabled={pending}
          onClick={() => void mark("CLEAN")}
          className="h-16 rounded-xl bg-emerald-700 text-xl font-bold text-white disabled:opacity-50"
        >
          ΚΑΘΑΡΟ
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => void mark("DIRTY")}
          className="h-16 rounded-xl bg-amber-700 text-xl font-bold text-white disabled:opacity-50"
        >
          ΔΕΝ ΕΙΝΑΙ ΚΑΘΑΡΟ
        </button>
      </div>
    </main>
  );
}
