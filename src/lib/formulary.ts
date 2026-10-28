import type { PrescriptionItem, ServiceType } from "@/lib/types";

/**
 * The short list of medications this clinic actually prescribes. Nurses pick
 * from here (or "Other") when recommending; each entry pre-fills sensible
 * defaults that the nurse and prescriber can edit. Not a drug database — just
 * a time-saver with no controlled substances.
 */
export interface FormularyEntry extends PrescriptionItem {
  id: string;
  /** Which service lines this is commonly used for (for ordering the picker). */
  services: ServiceType[];
}

export const FORMULARY: FormularyEntry[] = [
  {
    id: "tretinoin-025",
    drug: "Tretinoin cream",
    strength: "0.025%",
    sig: "Apply a pea-sized amount to clean, dry face nightly. Start every other night for 2 weeks.",
    quantity: "45 g",
    refills: 2,
    services: ["anti-aging", "acne", "hyperpigmentation"],
  },
  {
    id: "tretinoin-05",
    drug: "Tretinoin cream",
    strength: "0.05%",
    sig: "Apply a pea-sized amount to clean, dry face nightly.",
    quantity: "45 g",
    refills: 2,
    services: ["anti-aging", "acne"],
  },
  {
    id: "hydroquinone-4",
    drug: "Hydroquinone cream",
    strength: "4%",
    sig: "Apply a thin layer to dark spots twice daily for up to 3 months, then stop.",
    quantity: "30 g",
    refills: 1,
    services: ["hyperpigmentation"],
  },
  {
    id: "azelaic-15",
    drug: "Azelaic acid gel",
    strength: "15%",
    sig: "Apply a thin layer to affected areas twice daily.",
    quantity: "50 g",
    refills: 2,
    services: ["rosacea", "acne", "hyperpigmentation"],
  },
  {
    id: "clindamycin-bpo",
    drug: "Clindamycin 1% / Benzoyl peroxide 5% gel",
    strength: "1% / 5%",
    sig: "Apply a thin layer to affected areas once daily.",
    quantity: "50 g",
    refills: 2,
    services: ["acne"],
  },
  {
    id: "doxycycline-100",
    drug: "Doxycycline hyclate",
    strength: "100 mg",
    sig: "Take 1 capsule by mouth twice daily with food and a full glass of water.",
    quantity: "60 capsules",
    refills: 1,
    services: ["acne", "rosacea"],
  },
  {
    id: "spironolactone-50",
    drug: "Spironolactone",
    strength: "50 mg",
    sig: "Take 1 tablet by mouth once daily.",
    quantity: "30 tablets",
    refills: 2,
    services: ["acne"],
  },
  {
    id: "metronidazole-075",
    drug: "Metronidazole gel",
    strength: "0.75%",
    sig: "Apply a thin layer to affected areas twice daily.",
    quantity: "45 g",
    refills: 2,
    services: ["rosacea"],
  },
  {
    id: "ivermectin-1",
    drug: "Ivermectin cream",
    strength: "1%",
    sig: "Apply a pea-sized amount to affected areas once daily.",
    quantity: "45 g",
    refills: 1,
    services: ["rosacea"],
  },
  {
    id: "minoxidil-5-topical",
    drug: "Minoxidil topical solution",
    strength: "5%",
    sig: "Apply 1 mL to dry scalp twice daily.",
    quantity: "60 mL",
    refills: 3,
    services: ["hair-loss", "hair-growth"],
  },
  {
    id: "finasteride-1",
    drug: "Finasteride",
    strength: "1 mg",
    sig: "Take 1 tablet by mouth once daily.",
    quantity: "30 tablets",
    refills: 3,
    services: ["hair-loss", "hair-growth"],
  },
  {
    id: "terbinafine-250",
    drug: "Terbinafine",
    strength: "250 mg",
    sig: "Take 1 tablet by mouth once daily for 12 weeks.",
    quantity: "90 tablets",
    refills: 0,
    services: ["toe-nail-health"],
  },
  {
    id: "efinaconazole-10",
    drug: "Efinaconazole topical solution",
    strength: "10%",
    sig: "Apply to affected toenails once daily for 48 weeks.",
    quantity: "4 mL",
    refills: 3,
    services: ["toe-nail-health"],
  },
  {
    id: "triamcinolone-01",
    drug: "Triamcinolone acetonide cream",
    strength: "0.1%",
    sig: "Apply a thin layer to affected areas twice daily for up to 2 weeks.",
    quantity: "30 g",
    refills: 1,
    services: ["eczema-psoriasis"],
  },
  {
    id: "tacrolimus-01",
    drug: "Tacrolimus ointment",
    strength: "0.1%",
    sig: "Apply a thin layer to affected areas twice daily.",
    quantity: "30 g",
    refills: 2,
    services: ["eczema-psoriasis"],
  },
];

export const OTHER_DRUG_ID = "other";

/** Formulary ordered with this service's common picks first. */
export function formularyFor(serviceId: ServiceType | undefined): FormularyEntry[] {
  if (!serviceId) return FORMULARY;
  return [...FORMULARY].sort((a, b) => {
    const am = a.services.includes(serviceId) ? 0 : 1;
    const bm = b.services.includes(serviceId) ? 0 : 1;
    return am - bm;
  });
}

export function emptyPrescriptionItem(): PrescriptionItem {
  return { drug: "", strength: "", sig: "", quantity: "", refills: 0 };
}

/** "Tretinoin cream 0.025% — 45 g, 2 refills" for lists and emails. */
export function describeItem(item: PrescriptionItem): string {
  const head = [item.drug, item.strength].filter(Boolean).join(" ");
  const tail = [
    item.quantity,
    `${item.refills} refill${item.refills === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(", ");
  return tail ? `${head} — ${tail}` : head;
}
