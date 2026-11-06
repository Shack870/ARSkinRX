import type { IntakeResponse } from "@/lib/types";

const LABELS: Record<string, string> = {
  concern: "Main concern",
  duration: "Duration",
  medications: "Current medications",
  allergies: "Allergies",
  pregnant: "Pregnant / breastfeeding",
};

const PREGNANT_LABELS: Record<string, string> = {
  no: "No",
  yes: "Yes",
  na: "Not applicable",
};

function renderValue(key: string, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (key === "pregnant" && typeof value === "string") {
    return PREGNANT_LABELS[value] ?? value;
  }
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

/** Renders a patient's intake answers as a clean definition list. */
export function IntakeSummary({ intake }: { intake: IntakeResponse | null }) {
  if (!intake) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        No intake on file for this visit.
      </p>
    );
  }
  const answers = intake.answers ?? {};
  const orderedKeys = Object.keys(LABELS).filter((k) => k in answers);
  const extraKeys = Object.keys(answers).filter((k) => !(k in LABELS));

  return (
    <dl className="space-y-3">
      {[...orderedKeys, ...extraKeys].map((key) => (
        <div key={key}>
          <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            {LABELS[key] ?? key}
          </dt>
          <dd className="mt-0.5 text-sm whitespace-pre-wrap">
            {renderValue(key, answers[key])}
          </dd>
        </div>
      ))}
    </dl>
  );
}
