"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { LeadInterest, LeadPortfolioSize, LeadSource, LeadStatus } from "@hcp/domain";
import { leadLabels } from "@/lib/marketing/lead-labels";

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

export function LeadsList() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/platform/v1/leads")
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
  }, []);

  if (loading) return <p className="text-sm text-gray-600">Loading...</p>;
  if (error) {
    return (
      <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {error}
      </p>
    );
  }
  if (leads.length === 0) {
    return <p className="text-sm text-gray-600">No leads yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded border bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-3 py-2 font-medium">Created</th>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Email</th>
            <th className="px-3 py-2 font-medium">Phone</th>
            <th className="px-3 py-2 font-medium">Country</th>
            <th className="px-3 py-2 font-medium">Portfolio</th>
            <th className="px-3 py-2 font-medium">Interests</th>
            <th className="px-3 py-2 font-medium">Source</th>
            <th className="px-3 py-2 font-medium">Demo</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead.id} className="border-b last:border-0 hover:bg-gray-50">
              <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                {formatDate(lead.createdAt)}
              </td>
              <td className="px-3 py-2 font-medium">
                <Link
                  href={`/platform/leads/${lead.id}`}
                  className="text-gray-900 underline-offset-2 hover:underline"
                >
                  {lead.fullName}
                </Link>
              </td>
              <td className="px-3 py-2">{lead.email}</td>
              <td className="px-3 py-2 text-gray-600">{lead.phone ?? "—"}</td>
              <td className="px-3 py-2">{lead.country}</td>
              <td className="px-3 py-2">
                {leadLabels.portfolioSize(lead.portfolioSize)}
              </td>
              <td className="px-3 py-2">
                {leadLabels.interestsSummary(lead.interests)}
              </td>
              <td className="px-3 py-2">{leadLabels.source(lead.source)}</td>
              <td className="px-3 py-2">
                {lead.demoRequested ? (
                  <span className="inline-flex rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                    Demo requested
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td className="px-3 py-2">
                <span
                  className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                    lead.status === "new"
                      ? "bg-emerald-100 text-emerald-900"
                      : "bg-gray-100 text-gray-800"
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
  );
}
