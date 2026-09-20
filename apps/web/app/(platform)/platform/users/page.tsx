import Link from "next/link";
import {
  listPlatformUsersUseCase,
  listTenantsUseCase,
} from "@/lib/di/container";
import { requireSuperAdmin } from "@/lib/tenant-context";
import { PlatformRoleActions } from "@/features/platform-users/PlatformRoleActions";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
  } catch {
    return iso;
  }
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PlatformUsersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const actor = await requireSuperAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const tenantId = typeof sp.tenantId === "string" ? sp.tenantId : "";
  const platformRoleRaw =
    typeof sp.platformRole === "string" ? sp.platformRole : "";
  const platformRole =
    platformRoleRaw === "super_admin" || platformRoleRaw === "none"
      ? platformRoleRaw
      : undefined;
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : "1") || 1);

  const [tenantsResult, usersResult] = await Promise.all([
    listTenantsUseCase.execute({ page: 1, limit: 100 }),
    listPlatformUsersUseCase.execute({
      page,
      limit: 50,
      q: q || undefined,
      tenantId: tenantId || undefined,
      platformRole,
    }),
  ]);

  const tenants = tenantsResult.isSuccess
    ? tenantsResult.getValue().data.map(({ tenant }) => ({
        id: tenant.id,
        name: tenant.name,
      }))
    : [];

  if (usersResult.isFailure) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        Unable to load users.
      </div>
    );
  }

  const pageData = usersResult.getValue();

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-[var(--platform-ink)]">
          Users
        </h2>
        <p className="mt-1 text-sm text-[var(--platform-muted)]">
          Global user directory with tenant memberships. A user may belong to
          multiple tenants.
        </p>
      </div>

      <form
        method="get"
        className="grid gap-3 rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)] p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <label className="block text-xs font-medium text-[var(--platform-muted)]">
          Name / email
          <input
            name="q"
            defaultValue={q}
            placeholder="Search"
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
          Platform role
          <select
            name="platformRole"
            defaultValue={platformRole ?? ""}
            className="mt-1 w-full rounded-md border border-[var(--platform-border)] px-2.5 py-1.5 text-sm"
          >
            <option value="">Any</option>
            <option value="super_admin">Super Admin</option>
            <option value="none">No platform role</option>
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
        {pageData.total} user{pageData.total === 1 ? "" : "s"}
      </p>

      {pageData.data.length === 0 ? (
        <p className="rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)] px-4 py-8 text-center text-sm text-[var(--platform-muted)]">
          No users match these filters.
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
                <th className="px-4 py-2.5 font-medium">Memberships</th>
                <th className="px-4 py-2.5 font-medium">Platform</th>
                <th className="hidden px-4 py-2.5 font-medium lg:table-cell">
                  Created
                </th>
                <th className="px-4 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageData.data.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-[var(--platform-border)] last:border-0 align-top"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-[var(--platform-ink)]">
                      {user.name}
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--platform-muted)] md:hidden">
                      {user.email}
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-[var(--platform-muted)] md:table-cell">
                    {user.email}
                  </td>
                  <td className="px-4 py-3">
                    {user.memberships.length === 0 ? (
                      <span className="text-[var(--platform-muted)]">—</span>
                    ) : (
                      <ul className="space-y-1">
                        {user.memberships.map((m) => (
                          <li key={m.membershipId} className="text-xs">
                            <Link
                              href={`/platform/tenants/${m.tenantId}`}
                              className="font-medium text-[var(--platform-accent)] hover:underline"
                            >
                              {m.tenantName}
                            </Link>
                            <span className="text-[var(--platform-muted)]">
                              {" "}
                              · {m.role}
                              {m.status !== "active" ? ` (${m.status})` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {user.platformRole === "super_admin" ? (
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">
                        Super Admin
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--platform-muted)]">
                        —
                      </span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-[var(--platform-muted)] lg:table-cell">
                    {formatDate(user.createdAt.toISOString())}
                  </td>
                  <td className="px-4 py-3">
                    <PlatformRoleActions
                      userId={user.id}
                      isSuperAdmin={user.platformRole === "super_admin"}
                      currentUserId={actor.userId}
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
              href={`/platform/users?${new URLSearchParams({
                ...(q ? { q } : {}),
                ...(tenantId ? { tenantId } : {}),
                ...(platformRole ? { platformRole } : {}),
                page: String(page - 1),
              }).toString()}`}
              className="text-[var(--platform-accent)] hover:underline"
            >
              Previous
            </Link>
          ) : null}
          {page * pageData.limit < pageData.total ? (
            <Link
              href={`/platform/users?${new URLSearchParams({
                ...(q ? { q } : {}),
                ...(tenantId ? { tenantId } : {}),
                ...(platformRole ? { platformRole } : {}),
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
