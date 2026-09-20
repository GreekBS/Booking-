"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type {
  LeadInterest,
  LeadPortfolioSize,
  LeadSource,
  LeadStatus,
} from "@hcp/domain";
import { LEAD_SOURCES, LEAD_STATUSES } from "@hcp/domain";
import { LEAD_STATUS_OPTIONS, leadLabels } from "@/lib/marketing/lead-labels";

interface LeadRow {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  country: string;
  portfolioSize: LeadPortfolioSize;
  interests: LeadInterest[];
  source: LeadSource;
  status: LeadStatus;
  demoRequested: boolean;
  demoRequestedAt: string | null;
  createdAt: string;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

type Props = {
  initialStatus?: string | null;
  initialSource?: string | null;
  initialDemoRequested?: boolean | null;
};

export function LeadsList({
  initialStatus = null,
  initialSource = null,
  initialDemoRequested = null,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState(initialStatus ?? "");
  const [source, setSource] = useState(initialSource ?? "");
  const [demo, setDemo] = useState(
    initialDemoRequested === true
      ? "1"
      : initialDemoRequested === false
        ? "0"
        : "",
  );
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const q = new URLSearchParams();
    if (status && (LEAD_STATUSES as readonly string[]).includes(status)) {
      q.set("status", status);
    }
    if (source && (LEAD_SOURCES as readonly string[]).includes(source)) {
      q.set("source", source);
    }
    if (demo === "1" || demo === "0") q.set("demo", demo);
    return q.toString();
  }, [status, source, demo]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/platform/v1/leads${queryString ? `?${queryString}` : ""}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          throw new Error(body?.error?.message ?? `Failed (${r.status})`);
        }
        return r.json();
      })
      .then((data) => {
        setLeads(data.data ?? []);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load leads");
        setLoading(false);
      });
  }, [queryString]);

  function applyFilters(next: {
    status?: string;
    source?: string;
    demo?: string;
  }) {
    const nextStatus = next.status ?? status;
    const nextSource = next.source ?? source;
    const nextDemo = next.demo ?? demo;
    setStatus(nextStatus);
    setSource(nextSource);
    setDemo(nextDemo);

    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (nextStatus) params.set("status", nextStatus);
    else params.delete("status");
    if (nextSource) params.set("source", nextSource);
    else params.delete("source");
    if (nextDemo === "1" || nextDemo === "0") params.set("demo", nextDemo);
    else params.delete("demo");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)] p-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="text-xs">
          <span className="mb-1 block font-medium text-[var(--platform-muted)]">
            Status
          </span>
          <select
            value={status}
            onChange={(e) => applyFilters({ status: e.target.value })}
            className="min-w-[9rem] rounded-md border border-[var(--platform-border)] bg-white px-2.5 py-1.5 text-sm"
          >
            <option value="">All</option>
            {LEAD_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block font-medium text-[var(--platform-muted)]">
            Demo requested
          </span>
          <select
            value={demo}
            onChange={(e) => applyFilters({ demo: e.target.value })}
            className="min-w-[9rem] rounded-md border border-[var(--platform-border)] bg-white px-2.5 py-1.5 text-sm"
          >
            <option value="">All</option>
            <option value="1">Yes</option>
            <option value="0">No</option>
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block font-medium text-[var(--platform-muted)]">
            Source
          </span>
          <select
            value={source}
            onChange={(e) => applyFilters({ source: e.target.value })}
            className="min-w-[11rem] rounded-md border border-[var(--platform-border)] bg-white px-2.5 py-1.5 text-sm"
          >
            <option value="">All</option>
            {LEAD_SOURCES.map((value) => (
              <option key={value} value={value}>
                {leadLabels.source(value)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--platform-muted)]">Loading...</p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {!loading && !error && leads.length === 0 ? (
        <p className="rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)] px-4 py-8 text-center text-sm text-[var(--platform-muted)]">
          No leads match these filters.
        </p>
      ) : null}

      {!loading && !error && leads.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)]">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--platform-border)] bg-[var(--platform-muted-bg)]/60 text-[11px] uppercase tracking-wide text-[var(--platform-muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">
                  Phone
                </th>
                <th className="hidden px-3 py-2 font-medium lg:table-cell">
                  Country
                </th>
                <th className="hidden px-3 py-2 font-medium xl:table-cell">
                  Portfolio
                </th>
                <th className="px-3 py-2 font-medium">Interests</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Demo</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  className="border-b border-[var(--platform-border)] last:border-0 hover:bg-[var(--platform-muted-bg)]/40"
                >
                  <td className="whitespace-nowrap px-3 py-2.5 text-[var(--platform-muted)]">
                    {formatDate(lead.createdAt)}
                  </td>
                  <td className="px-3 py-2.5 font-medium">
                    <a
                      href={`/platform/leads/${lead.id}`}
                      className="text-[var(--platform-ink)] underline-offset-2 hover:underline"
                    >
                      {lead.fullName}
                    </a>
                  </td>
                  <td className="px-3 py-2.5">{lead.email}</td>
                  <td className="hidden px-3 py-2.5 text-[var(--platform-muted)] md:table-cell">
                    {lead.phone ?? "—"}
                  </td>
                  <td className="hidden px-3 py-2.5 lg:table-cell">
                    {lead.country}
                  </td>
                  <td className="hidden px-3 py-2.5 xl:table-cell">
                    {leadLabels.portfolioSize(lead.portfolioSize)}
                  </td>
                  <td className="px-3 py-2.5">
                    {leadLabels.interestsSummary(lead.interests)}
                  </td>
                  <td className="px-3 py-2.5">
                    {leadLabels.source(lead.source)}
                  </td>
                  <td className="px-3 py-2.5">
                    {lead.demoRequested ? (
                      <span className="inline-flex rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                        Demo
                      </span>
                    ) : (
                      <span className="text-[var(--platform-muted)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                        lead.status === "new"
                          ? "bg-emerald-100 text-emerald-900"
                          : "bg-[var(--platform-muted-bg)] text-[var(--platform-ink-soft)]"
                      }`}
                    >
                      {leadLabels.status(lead.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
