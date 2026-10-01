import type { LucideIcon } from "lucide-react";
import { Home, Lock, Sparkles, Timer, User, Wrench } from "lucide-react";
import type { OperatorBlockType } from "@/lib/admin/types";
import type { SpanKind } from "./span-layout";
import {
  BAR_BOOKING_CLASS,
  BAR_HOLD_CLASS,
  BAR_OPERATOR_CLASSES,
} from "@/features/extranet-calendar/lib/visual-theme";

export interface BarVisualConfig {
  className: string;
  icon: LucideIcon;
  iconClassName: string;
  patternClassName?: string;
}

/**
 * Timeline / span bar visuals — ops-* tokens only.
 * Must not use --primary or raw Tailwind blue/red/amber classes for inventory semantics
 * so a future primary-to-blue CTA remapping does not recolor bookings/blocks.
 */
const OPERATOR_CONFIG: Record<OperatorBlockType, BarVisualConfig> = {
  manual: {
    className: `${BAR_OPERATOR_CLASSES.manual} shadow-sm`,
    icon: Lock,
    iconClassName: "text-ops-blocked-fg",
    patternClassName:
      "bg-[repeating-linear-gradient(-45deg,transparent,transparent_3px,rgba(255,255,255,0.12)_3px,rgba(255,255,255,0.12)_6px)]",
  },
  maintenance: {
    className: `${BAR_OPERATOR_CLASSES.maintenance} shadow-sm`,
    icon: Wrench,
    iconClassName: "text-ops-maintenance-fg",
    patternClassName:
      "bg-[repeating-linear-gradient(90deg,transparent,transparent_4px,rgba(0,0,0,0.08)_4px,rgba(0,0,0,0.08)_5px)]",
  },
  cleaning: {
    className: `${BAR_OPERATOR_CLASSES.cleaning} shadow-sm`,
    icon: Sparkles,
    iconClassName: "text-ops-cleaning-fg",
    patternClassName:
      "bg-[radial-gradient(circle,rgba(255,255,255,0.15)_1px,transparent_1px)] bg-[length:6px_6px]",
  },
  owner: {
    className: `${BAR_OPERATOR_CLASSES.owner} shadow-sm`,
    icon: Home,
    iconClassName: "text-ops-owner-fg",
    patternClassName:
      "bg-[repeating-linear-gradient(0deg,transparent,transparent_5px,rgba(255,255,255,0.1)_5px,rgba(255,255,255,0.1)_6px)]",
  },
};

export function getBarVisualConfig(
  kind: SpanKind,
  operatorType?: OperatorBlockType,
): BarVisualConfig {
  if (kind === "booking") {
    return {
      className: `${BAR_BOOKING_CLASS} shadow-sm`,
      icon: User,
      iconClassName: "text-ops-booking-fg opacity-90",
    };
  }

  if (kind === "hold") {
    return {
      className: `${BAR_HOLD_CLASS} shadow-sm`,
      icon: Timer,
      iconClassName: "text-ops-hold-fg",
      patternClassName:
        "bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(0,0,0,0.06)_4px,rgba(0,0,0,0.06)_8px)]",
    };
  }

  if (operatorType && operatorType in OPERATOR_CONFIG) {
    return OPERATOR_CONFIG[operatorType];
  }

  return OPERATOR_CONFIG.manual;
}
