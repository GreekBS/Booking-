import { Suspense } from "react";
import { ReservationImportDraftPage } from "@/features/reservation-import/ReservationImportDraftPage";
import { Skeleton } from "@/components/ui/skeleton";

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ReservationImportDraftPage />
    </Suspense>
  );
}
