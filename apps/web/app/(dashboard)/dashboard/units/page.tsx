import { Suspense } from "react";
import { UnitsPage } from "@/features/units/UnitsPage";
import { Skeleton } from "@/components/ui/skeleton";

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <UnitsPage />
    </Suspense>
  );
}
