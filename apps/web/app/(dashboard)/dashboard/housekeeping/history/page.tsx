import { Suspense } from "react";
import { CleaningHistoryPage } from "@/features/cleaning/CleaningHistoryPage";
import { Skeleton } from "@/components/ui/skeleton";

export default function CleaningHistoryRoutePage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <CleaningHistoryPage />
    </Suspense>
  );
}
