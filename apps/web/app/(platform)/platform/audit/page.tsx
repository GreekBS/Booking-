import Link from "next/link";
import {
  listPlatformAuditLogsUseCase,
  listTenantsUseCase,
} from "@/lib/di/container";
import { PlatformPageHeader } from "@/components/platform/PlatformPageHeader";
import { formatPlatformDate } from "@/lib/platform/format";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function metadataPreview(metadata: Record<string, unknown>): string {
  const keys = Object.keys(metadata);
  if (keys.length === 0) return "—";
  try {
    const text = JSON.stringify(metadata);
    return text.length > 120 ? `${text.slice(0, 120)}…` : text;
  } catch {
    return `${keys.length} field${keys.length === 1 ? "" : "s"}`;
  }
}

export default async function PlatformAuditPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const action = typeof sp.action === "string" ? sp.action : "";
  const actorId = typeof sp.actorId === "string" ? sp.actorId : "";
  const tenantId = typeof sp.tenantId === "string" ? sp.tenantId : "";
  const from = typeof sp.from === "string" ? sp.from : "";
  const to = typeof sp.to === "string" ? sp.to : "";
  const page = Math.max(
    1,
    Number(typeof sp.page === "string" ? sp.page : "1") || 1,
  );

  const [tenantsResult, auditResult] = await Promise.all([
    listTenantsUseCase.execute({ page: 1, limit: 100 }),
    listPlatformAuditLogsUseCase.execute({
      page,
      limit: 50,
      action: action || undefined,
      actorId: actorId || undefined,
      tenantId: tenantId || undefined,
      from: from || undefined,
      to: to || undefined,
    }),
  ]);

  const tenants = tenantsResult.isSuccess
    ? tenantsResult.getValue().data.map(({ tenant }) => ({
        id: tenant.id,
        name: tenant.name,
      }))
    : [];

  if (auditResult.isFailure) {
    return (
      <div className="space-y-5">
        <PlatformPageHeader
          title="Audit Log"
          description="Persisted platform and tenant audit events."
        />
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Unable to load audit log.
        </div>
      </div>
    );
  }

  const pageData = auditResult.getValue();

  return (
    <div className="space-y-5">
      <PlatformPageHeader
        title="Audit Log"
        description="Truthful events already written to audit_logs. Coverage follows what use cases record — not a complete activity reconstruction."
      />

      <form
        method="get"
        className="grid gap-3 rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)] p-4 sm:grid-cols-2 lg:grid-cols-6"
      >
        <label className="block text-xs font-medium text-[var(--platform-muted)]">
          Action
          <input
            name="action"
            defaultValue={action}
            placeholder="e.g. tenant.suspended"
            className="mt-1 w-full rounded-md border border-[var(--platform-border)] px-2.5 py-1.5 text-sm"
          />
        </label>
        <label className="block text-xs font-medium text-[var(--platform-muted)]">
          Actor id
          <input
            name="actorId"
            defaultValue={actorId}
            placeholder="User UUID"
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
          From
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="mt-1 w-full rounded-md border border-[var(--platform-border)] px-2.5 py-1.5 text-sm"
          />
        </label>
        <label className="block text-xs font-medium text-[var(--platform-muted)]">
          To
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="mt-1 w-full rounded-md border border-[var(--platform-border)] px-2.5 py-1.5 text-sm"
          />
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
        {pageData.total} event{pageData.total === 1 ? "" : "s"}
      </p>

      {pageData.data.length === 0 ? (
        <p className="rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)] px-4 py-8 text-center text-sm text-[var(--platform-muted)]">
          No audit events match these filters.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)]">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--platform-border)] bg-[var(--platform-muted-bg)]/60 text-[11px] uppercase tracking-wide text-[var(--platform-muted)]">
              <tr>
                <th className="px-4 py-2.5 font-medium">When</th>
                <th className="px-4 py-2.5 font-medium">Action</th>
                <th className="px-4 py-2.5 font-medium">Actor</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">
                  Resource
                </th>
                <th className="hidden px-4 py-2.5 font-medium lg:table-cell">
                  Tenant
                </th>
                <th className="hidden px-4 py-2.5 font-medium xl:table-cell">
                  Metadata
                </th>
              </tr>
            </thead>
            <tbody>
              {pageData.data.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-[var(--platform-border)] last:border-0 align-top"
                >
                  <td className="px-4 py-3 text-[var(--platform-muted)]">
                    {formatPlatformDate(row.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-[var(--platform-ink)]">
                      {row.action}
                    </div>
                    {row.ipAddress ? (
                      <div className="mt-0.5 font-mono text-[11px] text-[var(--platform-muted)]">
                        {row.ipAddress}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{row.actorName}</div>
                    <div className="text-xs text-[var(--platform-muted)]">
                      {row.actorEmail}
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <div className="text-xs">{row.resourceType}</div>
                    <div className="font-mono text-[11px] text-[var(--platform-muted)]">
                      {row.resourceId ?? "—"}
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    {row.tenantId ? (
                      <Link
                        href={`/platform/tenants/${row.tenantId}`}
                        className="text-[var(--platform-accent)] hover:underline"
                      >
                        {row.tenantName ?? row.tenantId.slice(0, 8)}
                      </Link>
                    ) : (
                      <span className="text-[var(--platform-muted)]">—</span>
                    )}
                  </td>
                  <td className="hidden max-w-xs truncate px-4 py-3 font-mono text-[11px] text-[var(--platform-muted)] xl:table-cell">
                    {metadataPreview(row.metadata)}
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
              href={`/platform/audit?${new URLSearchParams({
                ...(action ? { action } : {}),
                ...(actorId ? { actorId } : {}),
                ...(tenantId ? { tenantId } : {}),
                ...(from ? { from } : {}),
                ...(to ? { to } : {}),
                page: String(page - 1),
              }).toString()}`}
              className="text-[var(--platform-accent)] hover:underline"
            >
              Previous
            </Link>
          ) : null}
          {page * pageData.limit < pageData.total ? (
            <Link
              href={`/platform/audit?${new URLSearchParams({
                ...(action ? { action } : {}),
                ...(actorId ? { actorId } : {}),
                ...(tenantId ? { tenantId } : {}),
                ...(from ? { from } : {}),
                ...(to ? { to } : {}),
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
