"use client";

import { useEffect, useState } from "react";
import type {
  LeadAccommodationType,
  LeadChannel,
  LeadInterest,
  LeadOperatingState,
  LeadPortfolioSize,
  LeadRelationship,
  LeadRevenueRange,
  LeadSource,
  LeadStatus,
  LeadTool,
} from "@hcp/domain";
import { LEAD_STATUS_OPTIONS, leadLabels } from "@/lib/marketing/lead-labels";

interface LeadDetail {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  country: string;
  relationship: LeadRelationship;
  portfolioSize: LeadPortfolioSize;
  accommodationTypes: LeadAccommodationType[];
  propertyCountry: string;
  propertyCity: string | null;
  operatingState: LeadOperatingState;
  channels: LeadChannel[];
  tools: LeadTool[];
  softwareName: string | null;
  hasWebsite: boolean | null;
  acceptsDirectBookings: boolean | null;
  revenueRange: LeadRevenueRange | null;
  interests: LeadInterest[];
  message: string | null;
  source: LeadSource;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  status: LeadStatus;
  demoRequested: boolean;
  demoRequestedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function yesNo(v: boolean | null): string {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return "—";
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-b border-[var(--platform-border)] py-2 sm:grid sm:grid-cols-[12rem_1fr] sm:gap-4">
      <dt className="text-sm font-medium text-[var(--platform-muted)]">{label}</dt>
      <dd className="mt-0.5 text-sm text-[var(--platform-ink)] sm:mt-0">
        {value || "—"}
      </dd>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)] p-4">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--platform-muted)]">
        {title}
      </h3>
      <dl>{children}</dl>
    </section>
  );
}

export function LeadDetailPanel({ leadId }: { leadId: string }) {
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<LeadStatus>("new");
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/platform/v1/leads/${leadId}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          throw new Error(body?.error?.message ?? `Failed (${r.status})`);
        }
        return r.json();
      })
      .then((data: LeadDetail) => {
        setLead(data);
        setStatus(data.status);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load lead");
        setLoading(false);
      });
  }, [leadId]);

  async function saveStatus() {
    if (!lead || saving) return;
    setSaving(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/platform/v1/leads/${leadId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage(data.error?.message ?? "Failed to update status");
        return;
      }
      setLead(data);
      setStatus(data.status);
      setStatusMessage("Status updated.");
    } catch {
      setStatusMessage("Failed to update status");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-[var(--platform-muted)]">Loading...</p>;
  }
  if (error || !lead) {
    return (
      <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {error ?? "Lead not found"}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[var(--platform-ink)]">
            {lead.fullName}
          </h2>
          <p className="text-sm text-[var(--platform-muted)]">{lead.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lead.demoRequested ? (
            <span className="rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900">
              Demo requested
            </span>
          ) : null}
          <span className="rounded bg-[var(--platform-muted-bg)] px-2 py-1 text-xs font-medium text-[var(--platform-ink-soft)]">
            {leadLabels.status(lead.status)}
          </span>
        </div>
      </div>

      <Section title="Contact">
        <Field label="Full name" value={lead.fullName} />
        <Field label="Email" value={lead.email} />
        <Field label="Phone" value={lead.phone} />
        <Field label="Country" value={lead.country} />
        <Field
          label="Relationship"
          value={leadLabels.relationship(lead.relationship)}
        />
      </Section>

      <Section title="Portfolio">
        <Field
          label="Portfolio size"
          value={leadLabels.portfolioSize(lead.portfolioSize)}
        />
        <Field
          label="Accommodation types"
          value={lead.accommodationTypes
            .map((v) => leadLabels.accommodation(v))
            .join(", ")}
        />
        <Field label="Property country" value={lead.propertyCountry} />
        <Field label="Property city" value={lead.propertyCity} />
        <Field
          label="Operating state"
          value={leadLabels.operatingState(lead.operatingState)}
        />
      </Section>

      <Section title="Current operations">
        <Field
          label="Channels"
          value={
            lead.channels.length
              ? lead.channels.map((v) => leadLabels.channel(v)).join(", ")
              : "—"
          }
        />
        <Field
          label="Tools"
          value={
            lead.tools.length
              ? lead.tools.map((v) => leadLabels.tool(v)).join(", ")
              : "—"
          }
        />
        <Field label="Software" value={lead.softwareName} />
        <Field label="Website" value={yesNo(lead.hasWebsite)} />
        <Field
          label="Direct bookings"
          value={yesNo(lead.acceptsDirectBookings)}
        />
      </Section>

      <Section title="Business">
        <Field
          label="Revenue range"
          value={
            lead.revenueRange ? leadLabels.revenueRange(lead.revenueRange) : "—"
          }
        />
      </Section>

      <Section title="Talos interest">
        <Field
          label="Interests"
          value={leadLabels.interestsSummary(lead.interests)}
        />
        <Field label="Message" value={lead.message} />
      </Section>

      <Section title="Acquisition">
        <Field label="Source" value={leadLabels.source(lead.source)} />
        <Field label="UTM source" value={lead.utmSource} />
        <Field label="UTM medium" value={lead.utmMedium} />
        <Field label="UTM campaign" value={lead.utmCampaign} />
        <Field label="Created" value={formatDate(lead.createdAt)} />
      </Section>

      <Section title="Demo">
        <Field label="Demo requested" value={lead.demoRequested ? "Yes" : "No"} />
        <Field
          label="Demo requested at"
          value={formatDate(lead.demoRequestedAt)}
        />
      </Section>

      <Section title="Internal workflow">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-500">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as LeadStatus)}
              className="rounded-md border border-[var(--platform-border)] bg-white px-3 py-2 text-sm"
              disabled={saving}
            >
              {LEAD_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void saveStatus()}
            disabled={saving || status === lead.status}
            className="rounded-md bg-[var(--platform-accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Update status"}
          </button>
        </div>
        {statusMessage ? (
          <p className="mt-2 text-sm text-[var(--platform-muted)]">{statusMessage}</p>
        ) : null}
      </Section>
    </div>
  );
}
