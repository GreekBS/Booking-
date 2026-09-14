import type { LucideIcon } from "lucide-react";
import { Home, Lock, Sparkles, Timer, User, Wrench } from "lucide-react";
import type { OperatorBlockType } from "@/lib/admin/types";
import type { SpanKind } from "./span-layout";

export interface BarVisualConfig {
  className: string;
  icon: LucideIcon;
  iconClassName: string;
  patternClassName?: string;
}

const OPERATOR_CONFIG: Record<OperatorBlockType, BarVisualConfig> = {
  manual: {
    className:
      "border border-red-700/80 bg-red-500/90 text-red-50 shadow-sm dark:border-red-500 dark:bg-red-900/90",
    icon: Lock,
    iconClassName: "text-red-100",
    patternClassName:
      "bg-[repeating-linear-gradient(-45deg,transparent,transparent_3px,rgba(255,255,255,0.12)_3px,rgba(255,255,255,0.12)_6px)]",
  },
  maintenance: {
    className:
      "border border-orange-700/80 bg-orange-500/90 text-orange-50 shadow-sm dark:border-orange-500 dark:bg-orange-900/90",
    icon: Wrench,
    iconClassName: "text-orange-100",
    patternClassName:
      "bg-[repeating-linear-gradient(90deg,transparent,transparent_4px,rgba(0,0,0,0.08)_4px,rgba(0,0,0,0.08)_5px)]",
  },
  cleaning: {
    className:
      "border border-violet-700/80 bg-violet-500/90 text-violet-50 shadow-sm dark:border-violet-500 dark:bg-violet-900/90",
    icon: Sparkles,
    iconClassName: "text-violet-100",
    patternClassName:
      "bg-[radial-gradient(circle,rgba(255,255,255,0.15)_1px,transparent_1px)] bg-[length:6px_6px]",
  },
  owner: {
    className:
      "border border-slate-600/80 bg-slate-500/90 text-slate-50 shadow-sm dark:border-slate-400 dark:bg-slate-700/90",
    icon: Home,
    iconClassName: "text-slate-100",
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
      className:
        "border border-blue-700/80 bg-blue-600/92 text-blue-50 shadow-sm dark:border-blue-400 dark:bg-blue-800/92",
      icon: User,
      iconClassName: "text-blue-100 opacity-90",
    };
  }

  if (kind === "hold") {
    return {
      className:
        "border-2 border-dashed border-amber-700/90 bg-amber-500/88 text-amber-950 shadow-sm dark:border-amber-400 dark:bg-amber-700/88 dark:text-amber-50",
      icon: Timer,
      iconClassName: "text-amber-900 dark:text-amber-100",
      patternClassName:
        "bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(0,0,0,0.06)_4px,rgba(0,0,0,0.06)_8px)]",
    };
  }

  if (operatorType && operatorType in OPERATOR_CONFIG) {
    return OPERATOR_CONFIG[operatorType];
  }

  return OPERATOR_CONFIG.manual;
}
