import { cn } from "@/lib/utils";
import { SHELL_CONTENT_BLEED_X } from "./shell-spacing";

interface StickyToolbarProps {
  children: React.ReactNode;
  className?: string;
}

export function StickyToolbar({ children, className }: StickyToolbarProps) {
  return (
    <div
      className={cn(
        "sticky top-0 z-10 mb-4 border-b bg-background/95 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        SHELL_CONTENT_BLEED_X,
        className,
      )}
    >
      {children}
    </div>
  );
}
