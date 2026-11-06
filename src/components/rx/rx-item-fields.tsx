"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PrescriptionItem } from "@/lib/types";

/**
 * Free-text prescription box. The nurse writes exactly what she wants to
 * prescribe (drug, strength, directions, quantity, refills) in her own words;
 * the text is stored in `drug` so the rest of the record keeps its shape.
 */
export function RxItemFields({
  value,
  onChange,
  compact,
  idPrefix,
  label = "Prescription",
}: {
  value: PrescriptionItem;
  onChange: (next: PrescriptionItem) => void;
  compact?: boolean;
  idPrefix: string;
  label?: string;
}) {
  return (
    <div>
      <Label htmlFor={`${idPrefix}-rx`} className="text-xs">
        {label}
      </Label>
      <Textarea
        id={`${idPrefix}-rx`}
        value={value.drug}
        onChange={(e) =>
          onChange({ drug: e.target.value, strength: "", sig: "", quantity: "", refills: 0 })
        }
        placeholder={
          "e.g. Tretinoin 0.025% cream, 45 g — apply a pea-sized amount nightly. 2 refills."
        }
        className={compact ? "min-h-[88px] text-sm" : "min-h-[110px]"}
        maxLength={1000}
      />
    </div>
  );
}
