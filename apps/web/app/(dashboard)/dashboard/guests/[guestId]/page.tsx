import { GuestProfilePage } from "@/features/guests/GuestProfilePage";

interface PageProps {
  params: Promise<{ guestId: string }>;
}

export default async function Page({ params }: PageProps) {
  const { guestId } = await params;
  return <GuestProfilePage guestId={guestId} />;
}
