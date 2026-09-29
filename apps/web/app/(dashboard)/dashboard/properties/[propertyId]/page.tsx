import { Suspense } from "react";
import { PropertyDetailPage } from "@/features/properties/PropertyDetailPage";
import { Skeleton } from "@/components/ui/skeleton";

interface PageProps {
  params: Promise<{ propertyId: string }>;
}

export default async function Page({ params }: PageProps) {
  const { propertyId } = await params;
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <PropertyDetailPage propertyId={propertyId} />
    </Suspense>
  );
}
