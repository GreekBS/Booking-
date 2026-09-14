import { cn } from "@/lib/utils";

interface StickyToolbarProps {
  children: React.ReactNode;
  className?: string;
}

export function StickyToolbar({ children, className }: StickyToolbarProps) {
  return (
    <div
      className={cn(
        "sticky top-0 z-10 -mx-4 mb-4 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8",
        className,
      )}
    >
      {children}
    </div>
  );
}
