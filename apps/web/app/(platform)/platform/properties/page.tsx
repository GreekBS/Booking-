import Link from "next/link";
import {
  listPlatformPropertiesUseCase,
  listTenantsUseCase,
} from "@/lib/di/container";
import { OpenTenantButton } from "@/features/tenants/OpenTenantButton";
import type { PropertyStatus } from "@hcp/domain";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
  } catch {
    return iso;
  }
}

function locationLabel(row: {
  city: string | null;
  region: string | null;
  country: string | null;
}): string {
  return [row.city, row.region, row.country].filter(Boolean).join(", ") || "—";
}

const STATUSES: PropertyStatus[] = ["draft", "active", "inactive", "archived"];

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PlatformPropertiesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const tenantId = typeof sp.tenantId === "string" ? sp.tenantId : "";
  const city = typeof sp.city === "string" ? sp.city : "";
  const statusRaw = typeof sp.status === "string" ? sp.status : "";
  const status = STATUSES.includes(statusRaw as PropertyStatus)
    ? (statusRaw as PropertyStatus)
    : undefined;
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : "1") || 1);

  const [tenantsResult, propertiesResult] = await Promise.all([
    listTenantsUseCase.execute({ page: 1, limit: 100 }),
    listPlatformPropertiesUseCase.execute({
      page,
      limit: 50,
      q: q || undefined,
      tenantId: tenantId || undefined,
      city: city || undefined,
      status,
    }),
  ]);

  const tenants = tenantsResult.isSuccess
    ? tenantsResult.getValue().data.map(({ tenant }) => ({
        id: tenant.id,
        name: tenant.name,
      }))
    : [];

  if (propertiesResult.isFailure) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        Unable to load properties.
      </div>
    );
  }

  const pageData = propertiesResult.getValue();

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-[var(--platform-ink)]">
          Properties
        </h2>
        <p className="mt-1 text-sm text-[var(--platform-muted)]">
          Global property directory across all tenants.
        </p>
      </div>

      <form
        method="get"
        className="grid gap-3 rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)] p-4 sm:grid-cols-2 lg:grid-cols-5"
      >
        <label className="block text-xs font-medium text-[var(--platform-muted)]">
          Name
          <input
            name="q"
            defaultValue={q}
            placeholder="Search name"
            className="mt-1 w-full rounded-md border border-[var(--platform-border)] px-2.5 py-1.5 text-sm"
          />
        </label>
        <label className="block text-xs font-medium text-[var(--platform-muted)]">
          Tenant
          <select
            name="tenantId"
            defaultValue={tenantId}
            className="mt-1 w-full rounded-md border border-[var(--platform-border)] px-2.5 py-1.5 text-sm"
          >
            <option value="">All tenants</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-[var(--platform-muted)]">
          City
          <input
            name="city"
            defaultValue={city}
            placeholder="City"
            className="mt-1 w-full rounded-md border border-[var(--platform-border)] px-2.5 py-1.5 text-sm"
          />
        </label>
        <label className="block text-xs font-medium text-[var(--platform-muted)]">
          Status
          <select
            name="status"
            defaultValue={status ?? ""}
            className="mt-1 w-full rounded-md border border-[var(--platform-border)] px-2.5 py-1.5 text-sm"
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className="w-full rounded-md bg-[var(--platform-accent)] px-3 py-2 text-sm font-semibold text-white hover:opacity-95"
          >
            Filter
          </button>
        </div>
      </form>

      <p className="text-xs text-[var(--platform-muted)]">
        {pageData.total} propert{pageData.total === 1 ? "y" : "ies"}
      </p>

      {pageData.data.length === 0 ? (
        <p className="rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)] px-4 py-8 text-center text-sm text-[var(--platform-muted)]">
          No properties match these filters.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)]">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--platform-border)] bg-[var(--platform-muted-bg)]/60 text-[11px] uppercase tracking-wide text-[var(--platform-muted)]">
              <tr>
                <th className="px-4 py-2.5 font-medium">Property</th>
                <th className="px-4 py-2.5 font-medium">Tenant</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">
                  Location
                </th>
                <th className="px-4 py-2.5 font-medium">Units</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="hidden px-4 py-2.5 font-medium lg:table-cell">
                  Created
                </th>
                <th className="px-4 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageData.data.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-[var(--platform-border)] last:border-0"
                >
                  <td className="px-4 py-3 font-medium text-[var(--platform-ink)]">
                    {row.name}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/platform/tenants/${row.tenantId}`}
                      className="font-medium text-[var(--platform-accent)] hover:underline"
                    >
                      {row.tenantName}
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3 text-[var(--platform-muted)] md:table-cell">
                    {locationLabel(row)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{row.unitCount}</td>
                  <td className="px-4 py-3 capitalize">{row.status}</td>
                  <td className="hidden px-4 py-3 text-[var(--platform-muted)] lg:table-cell">
                    {formatDate(row.createdAt.toISOString())}
                  </td>
                  <td className="px-4 py-3">
                    <OpenTenantButton
                      tenantId={row.tenantId}
                      destinationPath={`/dashboard/properties/${row.id}`}
                      label="Open"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pageData.total > pageData.limit ? (
        <div className="flex gap-3 text-sm">
          {page > 1 ? (
            <Link
              href={`/platform/properties?${new URLSearchParams({
                ...(q ? { q } : {}),
                ...(tenantId ? { tenantId } : {}),
                ...(city ? { city } : {}),
                ...(status ? { status } : {}),
                page: String(page - 1),
              }).toString()}`}
              className="text-[var(--platform-accent)] hover:underline"
            >
              Previous
            </Link>
          ) : null}
          {page * pageData.limit < pageData.total ? (
            <Link
              href={`/platform/properties?${new URLSearchParams({
                ...(q ? { q } : {}),
                ...(tenantId ? { tenantId } : {}),
                ...(city ? { city } : {}),
                ...(status ? { status } : {}),
                page: String(page + 1),
              }).toString()}`}
              className="text-[var(--platform-accent)] hover:underline"
            >
              Next
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
