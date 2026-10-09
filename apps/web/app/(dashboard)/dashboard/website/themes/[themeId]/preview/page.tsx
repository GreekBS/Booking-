import { Suspense } from "react";
import { ThemePreviewPage } from "@/features/website/ThemePreviewPage";
import { Skeleton } from "@/components/ui/skeleton";

interface PageProps {
  params: Promise<{ themeId: string }>;
}

export default async function Page({ params }: PageProps) {
  const { themeId } = await params;
  return (
    <Suspense
      fallback={
        <div className="space-y-3" data-testid="theme-preview-suspense">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <ThemePreviewPage themeId={themeId} />
    </Suspense>
  );
}
