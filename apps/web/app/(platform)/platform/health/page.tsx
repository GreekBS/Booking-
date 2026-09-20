import Link from "next/link";
import { getPlatformOperationsHealthUseCase } from "@/lib/di/container";
import type { PlatformStatusCount } from "@hcp/domain";

function countOf(rows: PlatformStatusCount[], status: string): number {
  return rows.find((r) => r.status === status)?.count ?? 0;
}

function totalOf(rows: PlatformStatusCount[]): number {
  return rows.reduce((sum, r) => sum + r.count, 0);
}

function HealthGroup({
  title,
  href,
  rows,
  highlight,
  emptyLabel,
}: {
  title: string;
  href: string;
  rows: PlatformStatusCount[];
  highlight: Array<{ status: string; label: string }>;
  emptyLabel: string;
}) {
  const total = totalOf(rows);
  const attention = highlight.reduce(
    (sum, h) => sum + countOf(rows, h.status),
    0,
  );

  return (
    <section className="rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)]">
      <div className="flex items-center justify-between border-b border-[var(--platform-border)] px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Link
          href={href}
          className="text-xs font-medium text-[var(--platform-accent)] hover:underline"
        >
          Open
        </Link>
      </div>
      <div className="space-y-3 p-4">
        <p className="text-sm text-[var(--platform-muted)]">
          {total === 0
            ? emptyLabel
            : attention === 0
              ? "No operational backlog detected in attention states."
              : `${attention} item${attention === 1 ? "" : "s"} in attention states.`}
        </p>
        <dl className="grid gap-2 sm:grid-cols-2">
          {rows.length === 0 ? (
            <div className="text-sm text-[var(--platform-muted)]">No rows.</div>
          ) : (
            rows
              .slice()
              .sort((a, b) => b.count - a.count)
              .map((row) => (
                <div
                  key={row.status}
                  className="flex items-center justify-between rounded border border-[var(--platform-border)] px-3 py-2 text-sm"
                >
                  <dt className="capitalize text-[var(--platform-ink)]">
                    {row.status.replaceAll("_", " ")}
                  </dt>
                  <dd className="tabular-nums text-[var(--platform-muted)]">
                    {row.count}
                  </dd>
                </div>
              ))
          )}
        </dl>
      </div>
    </section>
  );
}

export default async function PlatformHealthPage() {
  const result = await getPlatformOperationsHealthUseCase.execute();
  if (result.isFailure) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        Unable to load platform health summary.
      </div>
    );
  }

  const health = result.getValue();
  const jobsAttention =
    countOf(health.jobs, "dead_letter") + countOf(health.jobs, "pending");
  const inboxAttention =
    countOf(health.inbox, "failed") + countOf(health.inbox, "dead_letter");
  const outboxAttention = countOf(health.outbox, "dead_letter");
  const connectionAttention = countOf(health.connections, "error");

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-[var(--platform-ink)]">
          Platform Health
        </h2>
        <p className="mt-1 text-sm text-[var(--platform-muted)]">
          Internal operational summary derived from persisted Talos
          infrastructure — not an uptime or infrastructure monitor.
        </p>
      </div>

      <section className="rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)] p-4">
        <h3 className="text-sm font-semibold">Attention summary</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {connectionAttention === 0 &&
          countOf(health.jobs, "dead_letter") === 0 &&
          inboxAttention === 0 &&
          outboxAttention === 0 ? (
            <li className="text-[var(--platform-muted)]">
              No operational backlog detected across connections, dead-letter
              jobs, inbox failures, or dead-letter outbox events.
            </li>
          ) : (
            <>
              {connectionAttention > 0 ? (
                <li>
                  <Link
                    href="/platform/channels?status=error"
                    className="text-[var(--platform-accent)] hover:underline"
                  >
                    {connectionAttention} channel connection
                    {connectionAttention === 1 ? "" : "s"} in error
                  </Link>
                </li>
              ) : null}
              {countOf(health.jobs, "dead_letter") > 0 ? (
                <li>
                  <Link
                    href="/platform/operations?tab=jobs&status=dead_letter"
                    className="text-[var(--platform-accent)] hover:underline"
                  >
                    {countOf(health.jobs, "dead_letter")} dead-letter background
                    job
                    {countOf(health.jobs, "dead_letter") === 1 ? "" : "s"}
                  </Link>
                </li>
              ) : null}
              {inboxAttention > 0 ? (
                <li>
                  <Link
                    href="/platform/operations?tab=inbox&status=failed"
                    className="text-[var(--platform-accent)] hover:underline"
                  >
                    {inboxAttention} inbox item
                    {inboxAttention === 1 ? "" : "s"} failed or dead-lettered
                  </Link>
                </li>
              ) : null}
              {outboxAttention > 0 ? (
                <li>
                  <Link
                    href="/platform/operations?tab=outbox&status=dead_letter"
                    className="text-[var(--platform-accent)] hover:underline"
                  >
                    {outboxAttention} dead-letter outbox event
                    {outboxAttention === 1 ? "" : "s"}
                  </Link>
                </li>
              ) : null}
            </>
          )}
        </ul>
        {jobsAttention > 0 && countOf(health.jobs, "pending") > 0 ? (
          <p className="mt-3 text-xs text-[var(--platform-muted)]">
            Note: pending job counts include the full pending queue, not only
            failed retries.
          </p>
        ) : null}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <HealthGroup
          title="Channel connections"
          href="/platform/channels"
          rows={health.connections}
          highlight={[{ status: "error", label: "error" }]}
          emptyLabel="No channel connections recorded."
        />
        <HealthGroup
          title="Background jobs"
          href="/platform/operations?tab=jobs"
          rows={health.jobs}
          highlight={[
            { status: "dead_letter", label: "dead letter" },
            { status: "processing", label: "processing" },
          ]}
          emptyLabel="No background jobs recorded."
        />
        <HealthGroup
          title="Channel inbox"
          href="/platform/operations?tab=inbox"
          rows={health.inbox}
          highlight={[
            { status: "failed", label: "failed" },
            { status: "dead_letter", label: "dead letter" },
          ]}
          emptyLabel="No inbox items recorded."
        />
        <HealthGroup
          title="Outbox"
          href="/platform/operations?tab=outbox"
          rows={health.outbox}
          highlight={[
            { status: "dead_letter", label: "dead letter" },
            { status: "pending", label: "pending" },
          ]}
          emptyLabel="No outbox events recorded."
        />
      </div>
    </div>
  );
}
