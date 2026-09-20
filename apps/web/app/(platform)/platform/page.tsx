import Link from "next/link";
import { getPlatformOverviewUseCase } from "@/lib/di/container";
import { leadLabels } from "@/lib/marketing/lead-labels";
import { serializeLeadSummary } from "@/lib/marketing/serialize-lead";

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

function MetricCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href?: string;
}) {
  const body = (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--platform-muted)]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--platform-ink)]">
        {value}
      </p>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)] p-4 transition-colors hover:border-[var(--platform-accent)]/40"
      >
        {body}
      </Link>
    );
  }

  return (
    <div className="rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)] p-4">
      {body}
    </div>
  );
}

export default async function PlatformOverviewPage() {
  const result = await getPlatformOverviewUseCase.execute();
  if (result.isFailure) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        Unable to load platform overview.
      </div>
    );
  }

  const overview = result.getValue();
  const recentLeads = overview.recentLeads.map(serializeLeadSummary);
  const recentTenants = overview.recentTenants.map((tenant) => ({
    id: tenant.id,
    name: tenant.name,
    status: tenant.status,
    createdAt: tenant.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--platform-muted)]">
          Platform Control Center
        </p>
        <h2 className="mt-1 text-lg font-semibold text-[var(--platform-ink)]">
          Overview
        </h2>
        <p className="mt-1 text-sm text-[var(--platform-muted)]">
          Current tenant and lead state from live platform data.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <MetricCard
          label="Total tenants"
          value={overview.tenants.total}
          href="/platform/tenants"
        />
        <MetricCard
          label="Active tenants"
          value={overview.tenants.active}
          href="/platform/tenants"
        />
        <MetricCard
          label="Total properties"
          value={overview.properties.total}
          href="/platform/properties"
        />
        <MetricCard
          label="Total users"
          value={overview.users.total}
          href="/platform/users"
        />
        <MetricCard
          label="Total leads"
          value={overview.leads.total}
          href="/platform/leads"
        />
        <MetricCard
          label="New leads"
          value={overview.leads.newCount}
          href="/platform/leads?status=new"
        />
        <MetricCard
          label="Demo requests"
          value={overview.leads.demoRequestedCount}
          href="/platform/leads?demo=1"
        />
      </section>

      <section className="rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)]">
        <div className="border-b border-[var(--platform-border)] px-4 py-3">
          <h3 className="text-sm font-semibold">Needs attention</h3>
        </div>
        <div className="p-4">
          {overview.needsAttention.length === 0 ? (
            <p className="text-sm text-[var(--platform-muted)]">
              Nothing requires attention right now.
            </p>
          ) : (
            <ul className="space-y-2">
              {overview.needsAttention.map((item) => (
                <li key={item.kind}>
                  <Link
                    href={item.href}
                    className="flex items-center justify-between rounded-md border border-[var(--platform-border)] px-3 py-2 text-sm hover:border-[var(--platform-accent)]/40"
                  >
                    <span className="font-medium text-[var(--platform-ink)]">
                      {item.label}
                    </span>
                    <span className="tabular-nums text-[var(--platform-muted)]">
                      {item.count}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)]">
          <div className="flex items-center justify-between border-b border-[var(--platform-border)] px-4 py-3">
            <h3 className="text-sm font-semibold">Recent leads</h3>
            <Link
              href="/platform/leads"
              className="text-xs font-medium text-[var(--platform-accent)] hover:underline"
            >
              View all
            </Link>
          </div>
          {recentLeads.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[var(--platform-muted)]">
              No leads yet.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--platform-border)]">
              {recentLeads.map((lead) => (
                <li key={lead.id}>
                  <Link
                    href={`/platform/leads/${lead.id}`}
                    className="block px-4 py-3 hover:bg-[var(--platform-muted-bg)]/50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {lead.fullName}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--platform-muted)]">
                          {leadLabels.source(lead.source)} ·{" "}
                          {leadLabels.interestsSummary(lead.interests)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[11px] text-[var(--platform-muted)]">
                          {formatDate(lead.createdAt)}
                        </p>
                        <p className="mt-1 text-[11px] font-medium">
                          {leadLabels.status(lead.status)}
                          {lead.demoRequested ? " · Demo" : ""}
                        </p>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)]">
          <div className="flex items-center justify-between border-b border-[var(--platform-border)] px-4 py-3">
            <h3 className="text-sm font-semibold">Recent tenants</h3>
            <Link
              href="/platform/tenants"
              className="text-xs font-medium text-[var(--platform-accent)] hover:underline"
            >
              View all
            </Link>
          </div>
          {recentTenants.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[var(--platform-muted)]">
              No tenants yet.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--platform-border)]">
              {recentTenants.map((tenant) => (
                <li key={tenant.id}>
                  <Link
                    href={`/platform/tenants/${tenant.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--platform-muted-bg)]/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {tenant.name}
                      </p>
                      <p className="mt-0.5 text-xs capitalize text-[var(--platform-muted)]">
                        {tenant.status}
                      </p>
                    </div>
                    <p className="shrink-0 text-[11px] text-[var(--platform-muted)]">
                      {formatDate(tenant.createdAt)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
