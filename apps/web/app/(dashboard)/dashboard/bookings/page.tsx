import { Suspense } from "react";
import { BookingsPage } from "@/features/bookings/BookingsPage";
import { Skeleton } from "@/components/ui/skeleton";

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <BookingsPage />
    </Suspense>
  );
}
