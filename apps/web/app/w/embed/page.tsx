import { Suspense } from "react";
import WidgetEmbedHostClient from "./WidgetEmbedHostClient";

export default function WidgetEmbedHostPage() {
  return (
    <Suspense fallback={<div className="p-4">Loading widget…</div>}>
      <WidgetEmbedHostClient />
    </Suspense>
  );
}
