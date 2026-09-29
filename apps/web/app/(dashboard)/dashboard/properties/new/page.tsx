import { Suspense } from "react";
import { CreatePropertyPage } from "@/features/properties/CreatePropertyPage";
import { Skeleton } from "@/components/ui/skeleton";

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <CreatePropertyPage />
    </Suspense>
  );
}
