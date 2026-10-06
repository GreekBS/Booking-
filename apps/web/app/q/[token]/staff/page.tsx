import { StaffHousekeepingPage } from "@/features/cleaning/StaffHousekeepingPage";

/**
 * Staff PIN + scoped CLEAN/DIRTY UI.
 * Public page; mutations require hk_staff capability after PIN.
 */
export default async function QrStaffPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <StaffHousekeepingPage token={token} />;
}
