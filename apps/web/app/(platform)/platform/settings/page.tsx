import Link from "next/link";
import { getPlatformSystemConfigurationUseCase } from "@/lib/di/container";
import { PlatformPageHeader } from "@/components/platform/PlatformPageHeader";

export default async function PlatformSettingsPage() {
  const result = await getPlatformSystemConfigurationUseCase.execute();
  if (result.isFailure) {
    return (
      <div className="space-y-5">
        <PlatformPageHeader title="Settings" />
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Unable to load system configuration.
        </div>
      </div>
    );
  }

  const config = result.getValue();

  return (
    <div className="space-y-5">
      <PlatformPageHeader
        title="Settings"
        description="Read-only system configuration. Talos does not currently persist mutable Platform Settings, and environment secrets are not editable here."
      />

      <section className="rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)] p-4">
        <h3 className="text-sm font-semibold text-[var(--platform-ink)]">
          System configuration
        </h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-[var(--platform-muted)]">
              Platform
            </dt>
            <dd className="mt-1 text-sm">{config.platformLabel}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-[var(--platform-muted)]">
              Runtime environment
            </dt>
            <dd className="mt-1 text-sm capitalize">{config.environment}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-[var(--platform-muted)]">
              Node environment
            </dt>
            <dd className="mt-1 text-sm">{config.nodeEnv}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-[var(--platform-muted)]">
              Hosted on Vercel
            </dt>
            <dd className="mt-1 text-sm">{config.vercel ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-[var(--platform-muted)]">
              Super Admins
            </dt>
            <dd className="mt-1 text-sm tabular-nums">
              {config.superAdminCount}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-[var(--platform-muted)]">
              Tenants
            </dt>
            <dd className="mt-1 text-sm tabular-nums">
              <Link
                href="/platform/tenants"
                className="text-[var(--platform-accent)] hover:underline"
              >
                {config.tenantCount}
              </Link>
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)] p-4">
        <h3 className="text-sm font-semibold text-[var(--platform-ink)]">
          Mutable settings
        </h3>
        <p className="mt-2 text-sm text-[var(--platform-muted)]">
          No platform-level mutable settings are available in this release.
          Tenant commerce and catalog settings remain inside each tenant
          workspace. Secrets and credential material stay outside this UI.
        </p>
      </section>
    </div>
  );
}
