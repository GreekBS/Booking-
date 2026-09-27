import { CleaningLocationQrPrintPage } from "@/features/cleaning/CleaningLocationQrPrintPage";

export default async function CleaningLocationQrPrintRoutePage({
  params,
}: {
  params: Promise<{ locationId: string }>;
}) {
  const { locationId } = await params;
  return <CleaningLocationQrPrintPage locationId={locationId} />;
}
