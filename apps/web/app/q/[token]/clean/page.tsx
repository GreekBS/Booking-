import { QrLandingPage } from "@/features/cleaning/QrLandingPage";

/**
 * Authenticated operator checklist path (ADR-030 original).
 * Middleware requires Auth.js — not publicly accessible.
 * Physical stickers point at /q/{token}, not here.
 */
export default async function QrCleanPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <QrLandingPage token={token} />;
}
