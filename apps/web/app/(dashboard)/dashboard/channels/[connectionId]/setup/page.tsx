import { BookingComWizard } from "@/features/channels/booking-com/BookingComWizard";

type PageProps = { params: Promise<{ connectionId: string }> };

export default async function BookingComConnectionSetupPage({ params }: PageProps) {
  const { connectionId } = await params;
  return <BookingComWizard connectionId={connectionId} />;
}
