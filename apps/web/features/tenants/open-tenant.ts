/**
 * Platform Admin "Open tenant" orchestration.
 *
 * Impersonate API authorizes + audits; Auth.js update() is what establishes
 * JWT activeTenantId under session strategy "jwt". Navigate only after update.
 */

export const DASHBOARD_PROPERTIES_PATH = "/dashboard/properties";

export type OpenTenantDeps = {
  tenantId: string;
  /** Optional post-open destination; defaults to properties list. */
  destinationPath?: string;
  impersonate: (tenantId: string) => Promise<Response>;
  updateSession: (data: { activeTenantId: string }) => Promise<unknown>;
  navigate: (url: string) => void;
};

export type OpenTenantResult =
  | { ok: true }
  | { ok: false; error: string };

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as {
      error?: { message?: string };
      message?: string;
    };
    return (
      body.error?.message ??
      body.message ??
      `Impersonation failed (${res.status})`
    );
  } catch {
    return `Impersonation failed (${res.status})`;
  }
}

export async function openTenantAsPlatformAdmin(
  deps: OpenTenantDeps,
): Promise<OpenTenantResult> {
  const res = await deps.impersonate(deps.tenantId);
  if (!res.ok) {
    return { ok: false, error: await readErrorMessage(res) };
  }

  try {
    await deps.updateSession({ activeTenantId: deps.tenantId });
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Failed to update session with active tenant",
    };
  }

  deps.navigate(deps.destinationPath ?? DASHBOARD_PROPERTIES_PATH);
  return { ok: true };
}
