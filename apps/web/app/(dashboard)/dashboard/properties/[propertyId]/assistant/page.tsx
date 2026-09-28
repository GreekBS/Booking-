import { PropertyAiAssistantPage } from "@/features/messaging/PropertyAiAssistantPage";

interface PageProps {
  params: Promise<{ propertyId: string }>;
}

export default async function Page({ params }: PageProps) {
  const { propertyId } = await params;
  return <PropertyAiAssistantPage propertyId={propertyId} />;
}
