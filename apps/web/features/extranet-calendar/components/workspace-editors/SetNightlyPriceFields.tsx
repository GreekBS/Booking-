"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SetNightlyPriceFieldsProps {
  price: string;
  onPriceChange: (value: string) => void;
  currency: string;
  idPrefix?: string;
  helperText?: string;
}

export function SetNightlyPriceFields({
  price,
  onPriceChange,
  currency,
  idPrefix = "nightly-price",
  helperText = "Applies to every night in the selected range",
}: SetNightlyPriceFieldsProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-amount`}>Nightly price</Label>
      <div className="flex items-center gap-2">
        <Input
          id={`${idPrefix}-amount`}
          type="text"
          inputMode="decimal"
          placeholder="120"
          value={price}
          onChange={(e) => onPriceChange(e.target.value)}
          className="flex-1"
        />
        <span className="shrink-0 text-sm text-muted-foreground">{currency}</span>
      </div>
      <p className="text-[11px] text-muted-foreground">{helperText}</p>
    </div>
  );
}
