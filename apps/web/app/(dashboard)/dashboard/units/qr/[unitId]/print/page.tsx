import { UnitQrPrintPage } from "@/features/cleaning/UnitQrPrintPage";

export default async function UnitQrPrintRoutePage({
  params,
}: {
  params: Promise<{ unitId: string }>;
}) {
  const { unitId } = await params;
  return <UnitQrPrintPage unitId={unitId} />;
}
