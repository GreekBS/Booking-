import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlatformChannelDetailUseCase } from "@/lib/di/container";
import { formatPlatformDate, statusBadgeClass } from "@/lib/platform/format";

type Params = {
  params: Promise<{ tenantId: string; connectionId: string }>;
};

export default async function PlatformChannelDetailPage({ params }: Params) {
  const { tenantId, connectionId } = await params;
  const result = await getPlatformChannelDetailUseCase.execute(
    tenantId,
    connectionId,
  );
  if (result.isFailure) {
    notFound();
  }

  const detail = result.getValue();
  const c = detail.connection;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs text-[var(--platform-muted)]">
          <Link href="/platform/channels" className="hover:underline">
            Channels
          </Link>
          <span className="mx-1.5">/</span>
          <span className="font-mono">{c.connectionId}</span>
        </p>
        <h2 className="mt-1 text-lg font-semibold text-[var(--platform-ink)]">
          {c.displayName}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${statusBadgeClass(c.status)}`}
          >
            {c.status}
          </span>
          <span className="text-xs capitalize text-[var(--platform-muted)]">
            {c.provider}
          </span>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--platform-muted)]">
            Tenant
          </p>
          <Link
            href={`/platform/tenants/${c.tenantId}`}
            className="mt-2 block text-sm font-medium text-[var(--platform-accent)] hover:underline"
          >
            {c.tenantName}
          </Link>
        </div>
        <div className="rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--platform-muted)]">
            Credential ref
          </p>
          <p className="mt-2 text-sm">
            {c.hasCredentialRef ? "Present (opaque)" : "None"}
          </p>
        </div>
        <div className="rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--platform-muted)]">
            Inventory apply
          </p>
          <p className="mt-2 text-sm">
            {c.inventoryApplyEnabled ? "Enabled" : "Disabled"}
          </p>
        </div>
        <div className="rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--platform-muted)]">
            Poll cursor updated
          </p>
          <p className="mt-2 text-sm">
            {formatPlatformDate(detail.pollCursorUpdatedAt)}
          </p>
        </div>
      </section>

      {c.lastError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-medium">Last connection error</p>
          <p className="mt-1 break-words">{c.lastError}</p>
        </div>
      ) : null}

      <dl className="grid gap-2 rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)] p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[var(--platform-muted)]">Created</dt>
          <dd>{formatPlatformDate(c.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-[var(--platform-muted)]">Updated</dt>
          <dd>{formatPlatformDate(c.updatedAt)}</dd>
        </div>
      </dl>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Listing mappings</h3>
        {detail.mappings.length === 0 ? (
          <p className="rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)] px-4 py-6 text-sm text-[var(--platform-muted)]">
            No mappings for this connection.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)]">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--platform-border)] bg-[var(--platform-muted-bg)]/60 text-[11px] uppercase tracking-wide text-[var(--platform-muted)]">
                <tr>
                  <th className="px-4 py-2.5 font-medium">External listing</th>
                  <th className="px-4 py-2.5 font-medium">Property / unit</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="hidden px-4 py-2.5 font-medium md:table-cell">
                    Direction
                  </th>
                </tr>
              </thead>
              <tbody>
                {detail.mappings.map((m) => (
                  <tr
                    key={m.mappingId}
                    className="border-b border-[var(--platform-border)] last:border-0"
                  >
                    <td className="px-4 py-3 font-mono text-xs">
                      {m.externalListingId}
                      {m.externalUnitId ? ` / ${m.externalUnitId}` : ""}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {m.propertyId} / {m.unitId}
                    </td>
                    <td className="px-4 py-3 capitalize">{m.status}</td>
                    <td className="hidden px-4 py-3 capitalize md:table-cell">
                      {m.syncDirection}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Recent inbox activity</h3>
          <Link
            href={`/platform/operations?tab=inbox&tenantId=${c.tenantId}&connectionId=${c.connectionId}`}
            className="text-xs font-medium text-[var(--platform-accent)] hover:underline"
          >
            View in Operations
          </Link>
        </div>
        {detail.recentInbox.length === 0 ? (
          <p className="rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)] px-4 py-6 text-sm text-[var(--platform-muted)]">
            No recent inbox items.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)]">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--platform-border)] bg-[var(--platform-muted-bg)]/60 text-[11px] uppercase tracking-wide text-[var(--platform-muted)]">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Kind</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="hidden px-4 py-2.5 font-medium md:table-cell">
                    Outcome
                  </th>
                  <th className="px-4 py-2.5 font-medium">Received</th>
                </tr>
              </thead>
              <tbody>
                {detail.recentInbox.map((item) => (
                  <tr
                    key={item.inboxItemId}
                    className="border-b border-[var(--platform-border)] last:border-0"
                  >
                    <td className="px-4 py-3">
                      <div className="text-xs capitalize">{item.ingressKind}</div>
                      <div className="font-mono text-[11px] text-[var(--platform-muted)]">
                        {item.messageKind}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${statusBadgeClass(item.status)}`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-xs md:table-cell">
                      {item.outcome ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--platform-muted)]">
                      {formatPlatformDate(item.receivedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
