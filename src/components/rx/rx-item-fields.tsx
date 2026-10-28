"use client";

import * as React from "react";
import { FORMULARY, OTHER_DRUG_ID, formularyFor } from "@/lib/formulary";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PrescriptionItem, ServiceType } from "@/lib/types";

const selectClass =
  "flex h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-sm outline-none focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/30";

/**
 * Structured medication fields with a formulary picker. Used by the nurse when
 * recommending and by the prescriber when editing before approval.
 */
export function RxItemFields({
  value,
  onChange,
  serviceId,
  compact,
  idPrefix,
}: {
  value: PrescriptionItem;
  onChange: (next: PrescriptionItem) => void;
  serviceId?: ServiceType;
  compact?: boolean;
  idPrefix: string;
}) {
  const options = React.useMemo(() => formularyFor(serviceId), [serviceId]);
  const matched = FORMULARY.find(
    (f) => f.drug === value.drug && f.strength === value.strength,
  );
  const [pick, setPick] = React.useState<string>(
    matched ? matched.id : value.drug ? OTHER_DRUG_ID : "",
  );

  function choose(id: string) {
    setPick(id);
    if (id === OTHER_DRUG_ID) {
      onChange({ ...value, drug: value.drug && matched ? "" : value.drug });
      return;
    }
    const f = FORMULARY.find((x) => x.id === id);
    if (f) {
      onChange({
        drug: f.drug,
        strength: f.strength,
        sig: f.sig,
        quantity: f.quantity,
        refills: f.refills,
      });
    }
  }

  const set = (patch: Partial<PrescriptionItem>) => onChange({ ...value, ...patch });
  const text = compact ? "text-sm" : "";

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor={`${idPrefix}-pick`} className="text-xs">
          Medication
        </Label>
        <select
          id={`${idPrefix}-pick`}
          value={pick}
          onChange={(e) => choose(e.target.value)}
          className={selectClass}
        >
          <option value="">Choose from formulary…</option>
          {options.map((f) => (
            <option key={f.id} value={f.id}>
              {f.drug} {f.strength}
            </option>
          ))}
          <option value={OTHER_DRUG_ID}>Other (type it in)</option>
        </select>
      </div>

      {(pick === OTHER_DRUG_ID || pick !== "" || value.drug) && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Label htmlFor={`${idPrefix}-drug`} className="text-xs">
                Drug
              </Label>
              <Input
                id={`${idPrefix}-drug`}
                value={value.drug}
                onChange={(e) => set({ drug: e.target.value })}
                placeholder="e.g. Tretinoin cream"
                className={text}
              />
            </div>
            <div>
              <Label htmlFor={`${idPrefix}-strength`} className="text-xs">
                Strength
              </Label>
              <Input
                id={`${idPrefix}-strength`}
                value={value.strength}
                onChange={(e) => set({ strength: e.target.value })}
                placeholder="0.025%"
                className={text}
              />
            </div>
          </div>
          <div>
            <Label htmlFor={`${idPrefix}-sig`} className="text-xs">
              Directions (sig)
            </Label>
            <Textarea
              id={`${idPrefix}-sig`}
              value={value.sig}
              onChange={(e) => set({ sig: e.target.value })}
              placeholder="How the patient should use it"
              className={`min-h-[56px] ${text}`}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor={`${idPrefix}-qty`} className="text-xs">
                Quantity
              </Label>
              <Input
                id={`${idPrefix}-qty`}
                value={value.quantity}
                onChange={(e) => set({ quantity: e.target.value })}
                placeholder="45 g"
                className={text}
              />
            </div>
            <div>
              <Label htmlFor={`${idPrefix}-refills`} className="text-xs">
                Refills
              </Label>
              <Input
                id={`${idPrefix}-refills`}
                type="number"
                min={0}
                max={11}
                inputMode="numeric"
                value={String(value.refills)}
                onChange={(e) =>
                  set({ refills: Math.max(0, Math.min(11, Number(e.target.value) || 0)) })
                }
                className={text}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
