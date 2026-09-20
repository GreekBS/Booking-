import Link from "next/link";
import {
  listPlatformInboxUseCase,
  listPlatformJobsUseCase,
  listPlatformOutboxUseCase,
  listTenantsUseCase,
} from "@/lib/di/container";
import { formatPlatformDate, statusBadgeClass } from "@/lib/platform/format";
import type {
  BackgroundJobStatus,
  ChannelInboxProcessingStatus,
  OutboxEventStatus,
} from "@hcp/domain";

const TABS = ["jobs", "inbox", "outbox"] as const;
type Tab = (typeof TABS)[number];

const JOB_STATUSES: BackgroundJobStatus[] = [
  "pending",
  "processing",
  "completed",
  "dead_letter",
  "cancelled",
];
const INBOX_STATUSES: ChannelInboxProcessingStatus[] = [
  "received",
  "processing",
  "completed",
  "duplicate",
  "skipped",
  "failed",
  "dead_letter",
];
const OUTBOX_STATUSES: OutboxEventStatus[] = [
  "pending",
  "processing",
  "completed",
  "dead_letter",
];

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PlatformOperationsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const tabRaw = typeof sp.tab === "string" ? sp.tab : "jobs";
  const tab: Tab = TABS.includes(tabRaw as Tab) ? (tabRaw as Tab) : "jobs";
  const tenantId = typeof sp.tenantId === "string" ? sp.tenantId : "";
  const statusRaw = typeof sp.status === "string" ? sp.status : "";
  const jobType = typeof sp.jobType === "string" ? sp.jobType : "";
  const provider = typeof sp.provider === "string" ? sp.provider : "";
  const connectionId =
    typeof sp.connectionId === "string" ? sp.connectionId : "";
  const eventType = typeof sp.eventType === "string" ? sp.eventType : "";
  const page = Math.max(
    1,
    Number(typeof sp.page === "string" ? sp.page : "1") || 1,
  );

  const tenantsResult = await listTenantsUseCase.execute({ page: 1, limit: 100 });
  const tenants = tenantsResult.isSuccess
    ? tenantsResult.getValue().data.map(({ tenant }) => ({
        id: tenant.id,
        name: tenant.name,
      }))
    : [];

  const tabLinks = [
    { id: "jobs" as const, label: "Background Jobs" },
    { id: "inbox" as const, label: "Channel Inbox" },
    { id: "outbox" as const, label: "Outbox" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-[var(--platform-ink)]">
          Operations
        </h2>
        <p className="mt-1 text-sm text-[var(--platform-muted)]">
          Read-only diagnostics for background jobs, channel inbox, and outbox.
          No retry or mutation controls in this batch.
        </p>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-[var(--platform-border)]">
        {tabLinks.map((t) => {
          const active = tab === t.id;
          return (
            <Link
              key={t.id}
              href={`/platform/operations?tab=${t.id}`}
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

      {tab === "jobs" ? (
        <JobsPanel
          tenants={tenants}
          tenantId={tenantId}
          statusRaw={statusRaw}
          jobType={jobType}
          page={page}
        />
      ) : null}
      {tab === "inbox" ? (
        <InboxPanel
          tenants={tenants}
          tenantId={tenantId}
          statusRaw={statusRaw}
          provider={provider}
          connectionId={connectionId}
          page={page}
        />
      ) : null}
      {tab === "outbox" ? (
        <OutboxPanel
          tenants={tenants}
          tenantId={tenantId}
          statusRaw={statusRaw}
          eventType={eventType}
          page={page}
        />
      ) : null}
    </div>
  );
}

async function JobsPanel({
  tenants,
  tenantId,
  statusRaw,
  jobType,
  page,
}: {
  tenants: Array<{ id: string; name: string }>;
  tenantId: string;
  statusRaw: string;
  jobType: string;
  page: number;
}) {
  const status = JOB_STATUSES.includes(statusRaw as BackgroundJobStatus)
    ? (statusRaw as BackgroundJobStatus)
    : undefined;
  const result = await listPlatformJobsUseCase.execute({
    page,
    limit: 50,
    status,
    jobType: jobType || undefined,
    tenantId: tenantId || undefined,
  });
  if (result.isFailure) {
    return (
      <p className="text-sm text-red-700">Unable to load background jobs.</p>
    );
  }
  const pageData = result.getValue();

  return (
    <div className="space-y-4">
      <form
        method="get"
        className="grid gap-3 rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)] p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <input type="hidden" name="tab" value="jobs" />
        <label className="block text-xs font-medium text-[var(--platform-muted)]">
          Status
          <select
            name="status"
            defaultValue={status ?? ""}
            className="mt-1 w-full rounded-md border border-[var(--platform-border)] px-2.5 py-1.5 text-sm"
          >
            <option value="">All</option>
            {JOB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-[var(--platform-muted)]">
          Job type
          <input
            name="jobType"
            defaultValue={jobType}
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
            <option value="">All</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className="w-full rounded-md bg-[var(--platform-accent)] px-3 py-2 text-sm font-semibold text-white"
          >
            Filter
          </button>
        </div>
      </form>

      <p className="text-xs text-[var(--platform-muted)]">
        {pageData.total} job{pageData.total === 1 ? "" : "s"}
      </p>

      {pageData.data.length === 0 ? (
        <EmptyState message="No background jobs match these filters." />
      ) : (
        <div className="overflow-x-auto rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)]">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--platform-border)] bg-[var(--platform-muted-bg)]/60 text-[11px] uppercase tracking-wide text-[var(--platform-muted)]">
              <tr>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Attempts</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">
                  Run at
                </th>
                <th className="hidden px-4 py-2.5 font-medium lg:table-cell">
                  Tenant
                </th>
                <th className="hidden px-4 py-2.5 font-medium xl:table-cell">
                  Error
                </th>
              </tr>
            </thead>
            <tbody>
              {pageData.data.map((job) => (
                <tr
                  key={job.id}
                  className="border-b border-[var(--platform-border)] last:border-0 align-top"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{job.jobType}</div>
                    <div className="font-mono text-[11px] text-[var(--platform-muted)]">
                      {job.id}
                    </div>
                    <div className="text-[11px] text-[var(--platform-muted)]">
                      priority {job.priority}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClass(job.status)}`}
                    >
                      {job.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {job.attemptCount}/{job.maxAttempts}
                  </td>
                  <td className="hidden px-4 py-3 text-[var(--platform-muted)] md:table-cell">
                    {formatPlatformDate(job.runAt)}
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    {job.tenantId ? (
                      <Link
                        href={`/platform/tenants/${job.tenantId}`}
                        className="text-xs text-[var(--platform-accent)] hover:underline"
                      >
                        {job.tenantId.slice(0, 8)}…
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="hidden max-w-xs truncate px-4 py-3 text-xs text-red-700 xl:table-cell">
                    {job.lastError ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager
        base={`/platform/operations?tab=jobs`}
        page={page}
        total={pageData.total}
        limit={pageData.limit}
        extras={{
          ...(status ? { status } : {}),
          ...(jobType ? { jobType } : {}),
          ...(tenantId ? { tenantId } : {}),
        }}
      />
    </div>
  );
}

async function InboxPanel({
  tenants,
  tenantId,
  statusRaw,
  provider,
  connectionId,
  page,
}: {
  tenants: Array<{ id: string; name: string }>;
  tenantId: string;
  statusRaw: string;
  provider: string;
  connectionId: string;
  page: number;
}) {
  const status = INBOX_STATUSES.includes(statusRaw as ChannelInboxProcessingStatus)
    ? (statusRaw as ChannelInboxProcessingStatus)
    : undefined;
  const result = await listPlatformInboxUseCase.execute({
    page,
    limit: 50,
    status,
    provider: provider || undefined,
    tenantId: tenantId || undefined,
    connectionId: connectionId || undefined,
  });
  if (result.isFailure) {
    return <p className="text-sm text-red-700">Unable to load inbox items.</p>;
  }
  const pageData = result.getValue();

  return (
    <div className="space-y-4">
      <form
        method="get"
        className="grid gap-3 rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)] p-4 sm:grid-cols-2 lg:grid-cols-5"
      >
        <input type="hidden" name="tab" value="inbox" />
        <label className="block text-xs font-medium text-[var(--platform-muted)]">
          Status
          <select
            name="status"
            defaultValue={status ?? ""}
            className="mt-1 w-full rounded-md border border-[var(--platform-border)] px-2.5 py-1.5 text-sm"
          >
            <option value="">All</option>
            {INBOX_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-[var(--platform-muted)]">
          Provider
          <input
            name="provider"
            defaultValue={provider}
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
            <option value="">All</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-[var(--platform-muted)]">
          Connection id
          <input
            name="connectionId"
            defaultValue={connectionId}
            className="mt-1 w-full rounded-md border border-[var(--platform-border)] px-2.5 py-1.5 text-sm"
          />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className="w-full rounded-md bg-[var(--platform-accent)] px-3 py-2 text-sm font-semibold text-white"
          >
            Filter
          </button>
        </div>
      </form>

      <p className="text-xs text-[var(--platform-muted)]">
        {pageData.total} inbox item{pageData.total === 1 ? "" : "s"} (payloads
        not shown)
      </p>

      {pageData.data.length === 0 ? (
        <EmptyState message="No inbox items match these filters." />
      ) : (
        <div className="overflow-x-auto rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)]">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--platform-border)] bg-[var(--platform-muted-bg)]/60 text-[11px] uppercase tracking-wide text-[var(--platform-muted)]">
              <tr>
                <th className="px-4 py-2.5 font-medium">Event</th>
                <th className="px-4 py-2.5 font-medium">Connection</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Attempts</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">
                  Received
                </th>
              </tr>
            </thead>
            <tbody>
              {pageData.data.map((item) => (
                <tr
                  key={`${item.tenantId}:${item.inboxItemId}`}
                  className="border-b border-[var(--platform-border)] last:border-0 align-top"
                >
                  <td className="px-4 py-3">
                    <div className="text-xs capitalize">{item.provider}</div>
                    <div className="font-mono text-[11px]">{item.messageKind}</div>
                    <div className="text-[11px] text-[var(--platform-muted)]">
                      {item.ingressKind}
                      {item.outcome ? ` · ${item.outcome}` : ""}
                    </div>
                    {item.lastError ? (
                      <div className="mt-1 max-w-sm truncate text-xs text-red-700">
                        {item.lastError}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/platform/channels/${item.tenantId}/${item.connectionId}`}
                      className="font-mono text-xs text-[var(--platform-accent)] hover:underline"
                    >
                      {item.connectionId}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClass(item.status)}`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{item.attemptCount}</td>
                  <td className="hidden px-4 py-3 text-[var(--platform-muted)] md:table-cell">
                    {formatPlatformDate(item.receivedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager
        base={`/platform/operations?tab=inbox`}
        page={page}
        total={pageData.total}
        limit={pageData.limit}
        extras={{
          ...(status ? { status } : {}),
          ...(provider ? { provider } : {}),
          ...(tenantId ? { tenantId } : {}),
          ...(connectionId ? { connectionId } : {}),
        }}
      />
    </div>
  );
}

async function OutboxPanel({
  tenants,
  tenantId,
  statusRaw,
  eventType,
  page,
}: {
  tenants: Array<{ id: string; name: string }>;
  tenantId: string;
  statusRaw: string;
  eventType: string;
  page: number;
}) {
  const status = OUTBOX_STATUSES.includes(statusRaw as OutboxEventStatus)
    ? (statusRaw as OutboxEventStatus)
    : undefined;
  const result = await listPlatformOutboxUseCase.execute({
    page,
    limit: 50,
    status,
    eventType: eventType || undefined,
    tenantId: tenantId || undefined,
  });
  if (result.isFailure) {
    return <p className="text-sm text-red-700">Unable to load outbox events.</p>;
  }
  const pageData = result.getValue();

  return (
    <div className="space-y-4">
      <form
        method="get"
        className="grid gap-3 rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)] p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <input type="hidden" name="tab" value="outbox" />
        <label className="block text-xs font-medium text-[var(--platform-muted)]">
          Status
          <select
            name="status"
            defaultValue={status ?? ""}
            className="mt-1 w-full rounded-md border border-[var(--platform-border)] px-2.5 py-1.5 text-sm"
          >
            <option value="">All</option>
            {OUTBOX_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-[var(--platform-muted)]">
          Event type
          <input
            name="eventType"
            defaultValue={eventType}
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
            <option value="">All</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className="w-full rounded-md bg-[var(--platform-accent)] px-3 py-2 text-sm font-semibold text-white"
          >
            Filter
          </button>
        </div>
      </form>

      <p className="text-xs text-[var(--platform-muted)]">
        {pageData.total} outbox event{pageData.total === 1 ? "" : "s"}
      </p>

      {pageData.data.length === 0 ? (
        <EmptyState message="No outbox events match these filters." />
      ) : (
        <div className="overflow-x-auto rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)]">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--platform-border)] bg-[var(--platform-muted-bg)]/60 text-[11px] uppercase tracking-wide text-[var(--platform-muted)]">
              <tr>
                <th className="px-4 py-2.5 font-medium">Event</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Attempts</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">
                  Created
                </th>
                <th className="hidden px-4 py-2.5 font-medium lg:table-cell">
                  Claimed / processed
                </th>
              </tr>
            </thead>
            <tbody>
              {pageData.data.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-[var(--platform-border)] last:border-0 align-top"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{row.eventType}</div>
                    <div className="text-[11px] text-[var(--platform-muted)]">
                      {row.aggregateType} · {row.aggregateId.slice(0, 8)}…
                    </div>
                    {row.lastError ? (
                      <div className="mt-1 max-w-sm truncate text-xs text-red-700">
                        {row.lastError}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClass(row.status)}`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{row.attemptCount}</td>
                  <td className="hidden px-4 py-3 text-[var(--platform-muted)] md:table-cell">
                    {formatPlatformDate(row.createdAt)}
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-[var(--platform-muted)] lg:table-cell">
                    {formatPlatformDate(row.claimedAt)} /{" "}
                    {formatPlatformDate(row.processedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager
        base={`/platform/operations?tab=outbox`}
        page={page}
        total={pageData.total}
        limit={pageData.limit}
        extras={{
          ...(status ? { status } : {}),
          ...(eventType ? { eventType } : {}),
          ...(tenantId ? { tenantId } : {}),
        }}
      />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)] px-4 py-8 text-center text-sm text-[var(--platform-muted)]">
      {message}
    </p>
  );
}

function Pager({
  base,
  page,
  total,
  limit,
  extras,
}: {
  base: string;
  page: number;
  total: number;
  limit: number;
  extras: Record<string, string>;
}) {
  if (total <= limit) return null;
  const qs = (p: number) =>
    new URLSearchParams({ ...extras, page: String(p) }).toString();
  return (
    <div className="flex gap-3 text-sm">
      {page > 1 ? (
        <Link
          href={`${base}&${qs(page - 1)}`}
          className="text-[var(--platform-accent)] hover:underline"
        >
          Previous
        </Link>
      ) : null}
      {page * limit < total ? (
        <Link
          href={`${base}&${qs(page + 1)}`}
          className="text-[var(--platform-accent)] hover:underline"
        >
          Next
        </Link>
      ) : null}
    </div>
  );
}
