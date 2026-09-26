import { Suspense } from "react";
import { ManualBookingPage } from "@/features/bookings/ManualBookingPage";
import { Skeleton } from "@/components/ui/skeleton";

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ManualBookingPage />
    </Suspense>
  );
}
