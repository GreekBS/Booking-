import { cn } from "@/lib/utils";

/** Optimized local asset for the Talia Operator Copilot portrait. */
export const TALIA_AVATAR_SRC = "/operator-copilot/talia-avatar.webp";

export interface TaliaPortraitProps {
  size: number;
  className?: string;
  /** Small green “online” dot (launcher / header). */
  showOnline?: boolean;
}

/**
 * Circular Talia portrait used by the floating launcher and chat header.
 * Decorative only — parent supplies accessible names.
 */
export function TaliaPortrait({ size, className, showOnline = false }: TaliaPortraitProps) {
  const onlineSize = Math.max(8, Math.round(size * 0.22));
  return (
    <span
      aria-hidden="true"
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <span
        className={cn(
          "block h-full w-full overflow-hidden rounded-full",
          // Inset ring + soft purple glow so the fixed launcher size stays exact.
          "shadow-[0_0_0_2px_rgba(139,156,247,0.9),0_4px_14px_rgba(99,102,241,0.28)]",
        )}
      >
        <img
          src={TALIA_AVATAR_SRC}
          alt=""
          width={size}
          height={size}
          draggable={false}
          className="pointer-events-none h-full w-full select-none object-cover"
        />
      </span>
      {showOnline ? (
        <span
          className="absolute bottom-0 right-0 rounded-full border-2 border-background bg-emerald-500"
          style={{ width: onlineSize, height: onlineSize }}
        />
      ) : null}
    </span>
  );
}
