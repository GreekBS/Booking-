import { PropertyDetailPage } from "@/features/properties/PropertyDetailPage";

interface PageProps {
  params: Promise<{ propertyId: string }>;
}

export default async function Page({ params }: PageProps) {
  const { propertyId } = await params;
  return <PropertyDetailPage propertyId={propertyId} />;
}
