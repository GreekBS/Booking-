import { Suspense } from "react";
import { ReservationImportLandingPage } from "@/features/reservation-import/ReservationImportLandingPage";
import { Skeleton } from "@/components/ui/skeleton";

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ReservationImportLandingPage />
    </Suspense>
  );
}
