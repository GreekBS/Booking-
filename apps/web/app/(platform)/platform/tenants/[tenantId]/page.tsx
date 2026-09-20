import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlatformTenantDetailUseCase } from "@/lib/di/container";
import { OpenTenantButton } from "@/features/tenants/OpenTenantButton";
import { TenantStatusActions } from "@/features/tenants/TenantStatusActions";

function formatDate(value: Date | string): string {
  try {
    return new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" });
  } catch {
    return String(value);
  }
}

function locationLabel(row: {
  city: string | null;
  region: string | null;
  country: string | null;
}): string {
  return [row.city, row.region, row.country].filter(Boolean).join(", ") || "—";
}

type Params = { params: Promise<{ tenantId: string }> };
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PlatformTenantDetailPage({
  params,
  searchParams,
}: Params & { searchParams: SearchParams }) {
  const { tenantId } = await params;
  const sp = await searchParams;
  const tabRaw = typeof sp.tab === "string" ? sp.tab : "overview";
  const tab =
    tabRaw === "properties" || tabRaw === "users" ? tabRaw : "overview";

  const result = await getPlatformTenantDetailUseCase.execute(tenantId);
  if (result.isFailure) {
    notFound();
  }

  const detail = result.getValue();
  const tenant = detail.tenant;
  const settings = tenant.settings;

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "properties", label: `Properties (${detail.propertyCount})` },
    { id: "users", label: `Users (${detail.memberCount})` },
  ] as const;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs text-[var(--platform-muted)]">
            <Link href="/platform/tenants" className="hover:underline">
              Tenants
            </Link>
            <span className="mx-1.5">/</span>
            <span>{tenant.slug.value}</span>
          </p>
          <h2 className="mt-1 text-lg font-semibold text-[var(--platform-ink)]">
            {tenant.name}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${
                tenant.status === "active"
                  ? "bg-emerald-100 text-emerald-900"
                  : tenant.status === "suspended"
                    ? "bg-amber-100 text-amber-900"
                    : "bg-[var(--platform-muted-bg)] text-[var(--platform-ink-soft)]"
              }`}
            >
              {tenant.status}
            </span>
            <span className="text-xs text-[var(--platform-muted)]">
              Created {formatDate(tenant.createdAt)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <OpenTenantButton tenantId={tenant.id} label="Open tenant" />
          <TenantStatusActions tenantId={tenant.id} status={tenant.status} />
        </div>
      </div>

      <nav className="flex gap-1 border-b border-[var(--platform-border)]">
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <Link
              key={t.id}
              href={`/platform/tenants/${tenant.id}?tab=${t.id}`}
              className={`px-3 py-2 text-sm font-medium ${
                active
                  ? "border-b-2 border-[var(--platform-accent)] text-[var(--platform-ink)]"
                  : "text-[var(--platform-muted)] hover:text-[var(--platform-ink)]"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {tab === "overview" ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--platform-muted)]">
              Properties
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {detail.propertyCount}
            </p>
          </div>
          <div className="rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--platform-muted)]">
              Members
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {detail.memberCount}
            </p>
          </div>
          <div className="rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)] p-4 sm:col-span-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--platform-muted)]">
              Identity
            </p>
            <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[var(--platform-muted)]">Slug</dt>
                <dd className="font-mono text-xs">{tenant.slug.value}</dd>
              </div>
              <div>
                <dt className="text-[var(--platform-muted)]">Timezone</dt>
                <dd>{settings.timezone}</dd>
              </div>
              <div>
                <dt className="text-[var(--platform-muted)]">Locale</dt>
                <dd>{settings.defaultLocale}</dd>
              </div>
              <div>
                <dt className="text-[var(--platform-muted)]">Currency</dt>
                <dd>{settings.defaultCurrency}</dd>
              </div>
            </dl>
          </div>
        </section>
      ) : null}

      {tab === "properties" ? (
        detail.properties.length === 0 ? (
          <p className="rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)] px-4 py-8 text-center text-sm text-[var(--platform-muted)]">
            No properties for this tenant.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)]">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--platform-border)] bg-[var(--platform-muted-bg)]/60 text-[11px] uppercase tracking-wide text-[var(--platform-muted)]">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Property</th>
                  <th className="hidden px-4 py-2.5 font-medium md:table-cell">
                    Location
                  </th>
                  <th className="px-4 py-2.5 font-medium">Units</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {detail.properties.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[var(--platform-border)] last:border-0"
                  >
                    <td className="px-4 py-3 font-medium">{row.name}</td>
                    <td className="hidden px-4 py-3 text-[var(--platform-muted)] md:table-cell">
                      {locationLabel(row)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{row.unitCount}</td>
                    <td className="px-4 py-3 capitalize">{row.status}</td>
                    <td className="px-4 py-3">
                      <OpenTenantButton
                        tenantId={tenant.id}
                        destinationPath={`/dashboard/properties/${row.id}`}
                        label="Open"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {tab === "users" ? (
        detail.members.length === 0 ? (
          <p className="rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)] px-4 py-8 text-center text-sm text-[var(--platform-muted)]">
            No memberships for this tenant.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)]">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--platform-border)] bg-[var(--platform-muted-bg)]/60 text-[11px] uppercase tracking-wide text-[var(--platform-muted)]">
                <tr>
                  <th className="px-4 py-2.5 font-medium">User</th>
                  <th className="hidden px-4 py-2.5 font-medium md:table-cell">
                    Email
                  </th>
                  <th className="px-4 py-2.5 font-medium">Role</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="hidden px-4 py-2.5 font-medium lg:table-cell">
                    Platform
                  </th>
                </tr>
              </thead>
              <tbody>
                {detail.members.map((m) => (
                  <tr
                    key={m.membershipId}
                    className="border-b border-[var(--platform-border)] last:border-0"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/platform/users?q=${encodeURIComponent(m.email)}`}
                        className="font-medium text-[var(--platform-accent)] hover:underline"
                      >
                        {m.name}
                      </Link>
                    </td>
                    <td className="hidden px-4 py-3 text-[var(--platform-muted)] md:table-cell">
                      {m.email}
                    </td>
                    <td className="px-4 py-3 capitalize">{m.role}</td>
                    <td className="px-4 py-3 capitalize">{m.status}</td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      {m.platformRole === "super_admin" ? (
                        <span className="text-xs font-medium text-emerald-800">
                          Super Admin
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </div>
  );
}
