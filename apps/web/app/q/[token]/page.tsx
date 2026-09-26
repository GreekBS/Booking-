import { QrLandingPage } from "@/features/cleaning/QrLandingPage";

/**
 * Public URL printed on the unit QR sticker. Not a public page: middleware
 * redirects unauthenticated visitors to `/login?callbackUrl=/q/<token>` and
 * returns them here after sign-in.
 */
export default async function QrTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <QrLandingPage token={token} />;
}
