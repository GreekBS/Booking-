import { redirect, notFound } from "next/navigation";
import { resolvePublicQrRouteUseCase } from "@/lib/di/container";

/**
 * Physical QR entrypoint. Public (no Auth.js).
 * ACTIVE QR + websiteUrl → safe external redirect.
 * ACTIVE QR + no website → Staff PIN flow.
 * Invalid/revoked → 404.
 *
 * Authenticated checklist remains at /q/{token}/clean.
 */
export default async function QrTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[0-9a-f]{64}$/i.test(token)) {
    notFound();
  }

  const result = await resolvePublicQrRouteUseCase.execute({ token });
  if (result.isFailure) {
    notFound();
  }

  const { route } = result.getValue();
  if (route.kind === "redirect_website") {
    redirect(route.websiteUrl);
  }

  redirect(`/q/${token.toLowerCase()}/staff`);
}
