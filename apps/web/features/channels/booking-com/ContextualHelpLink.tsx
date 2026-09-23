import Link from "next/link";
import { BookOpen } from "lucide-react";

export function ContextualHelpLink({
  anchor,
  label,
}: {
  anchor: string;
  label: string;
}) {
  return (
    <Link
      href={`/dashboard/channels/help/booking-com#${anchor}`}
      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
    >
      <BookOpen className="h-3.5 w-3.5" aria-hidden />
      {label}
    </Link>
  );
}
