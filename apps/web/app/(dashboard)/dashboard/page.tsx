import { Suspense } from "react";
import { DashboardOverview } from "@/features/dashboard/DashboardOverview";
import { Skeleton } from "@/components/ui/skeleton";

function DashboardFallback() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-40 w-full rounded-lg" />
      <Skeleton className="h-56 w-full rounded-lg" />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardFallback />}>
      <DashboardOverview />
    </Suspense>
  );
}
