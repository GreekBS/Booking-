import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "on-dark";

const styles: Record<Variant, string> = {
  primary:
    "bg-[var(--talos-forest)] text-[var(--talos-paper)] hover:bg-[var(--talos-forest-deep)]",
  secondary:
    "bg-transparent text-[var(--talos-ink)] border border-[var(--talos-ink)]/20 hover:border-[var(--talos-ink)]/45",
  ghost: "bg-transparent text-[var(--talos-ink-soft)] hover:text-[var(--talos-ink)]",
  "on-dark":
    "bg-[var(--talos-paper)] text-[var(--talos-ink)] hover:bg-white",
};

export function MarketingButton({
  href,
  children,
  variant = "primary",
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center rounded-sm px-5 py-3 text-sm font-semibold tracking-wide transition-colors",
        styles[variant],
        className,
      )}
    >
      {children}
    </Link>
  );
}
