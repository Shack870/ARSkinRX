import type { ServiceDefinition, ServiceType } from "./types";

/**
 * The ARSkinRX service catalog. These are the condition lines clients book
 * against and providers opt into during onboarding. Prices are defaults in
 * cents; a provider can override per-service.
 */
export const SERVICES: ServiceDefinition[] = [
  {
    id: "anti-aging",
    slug: "anti-aging",
    name: "Anti-Aging",
    shortDescription: "Prescription skincare for fine lines, wrinkles, and tone.",
    description:
      "A virtual visit to build a personalized anti-aging plan — prescription tretinoin, growth-factor routines, and evidence-based skincare to smooth fine lines and improve skin tone and texture.",
    defaultPriceCents: 7900,
    durationMinutes: 15,
    icon: "Sparkles",
  },
  {
    id: "hyperpigmentation",
    slug: "hyperpigmentation",
    name: "Hyperpigmentation",
    shortDescription: "Treat dark spots, melasma, and uneven pigment.",
    description:
      "Targeted treatment for melasma, sun spots, and post-inflammatory hyperpigmentation using prescription-strength brighteners and a custom routine.",
    defaultPriceCents: 7900,
    durationMinutes: 15,
    icon: "Sun",
  },
  {
    id: "acne",
    slug: "acne",
    name: "Acne",
    shortDescription: "Clear breakouts with a prescription plan.",
    description:
      "From occasional breakouts to persistent acne, get a prescription treatment plan — topical and oral options — tailored to your skin.",
    defaultPriceCents: 6900,
    durationMinutes: 15,
    icon: "Droplet",
  },
  {
    id: "rosacea",
    slug: "rosacea",
    name: "Rosacea",
    shortDescription: "Calm redness, flushing, and flare-ups.",
    description:
      "Manage facial redness, flushing, and bumps with prescription therapies and trigger-avoidance guidance designed for rosacea-prone skin.",
    defaultPriceCents: 6900,
    durationMinutes: 15,
    icon: "Flame",
  },
  {
    id: "hair-loss",
    slug: "hair-loss",
    name: "Hair Loss",
    shortDescription: "Slow shedding and protect existing hair.",
    description:
      "Evaluate the cause of thinning and get prescription options to slow hair loss and protect the hair you have.",
    defaultPriceCents: 7900,
    durationMinutes: 15,
    icon: "Scissors",
  },
  {
    id: "hair-growth",
    slug: "hair-growth",
    name: "Hair Growth Stimulation",
    shortDescription: "Stimulate regrowth and fuller hair.",
    description:
      "Prescription and clinically-backed regimens — including topical minoxidil and adjunct therapies — to stimulate regrowth and improve density.",
    defaultPriceCents: 7900,
    durationMinutes: 15,
    icon: "Sprout",
  },
  {
    id: "toe-nail-health",
    slug: "toe-nail-health",
    name: "Toe & Nail Health",
    shortDescription: "Fungus and nail issues, treated remotely.",
    description:
      "A focused visit for toenail fungus (onychomycosis), discoloration, thickening, and other nail concerns, with prescription antifungal options.",
    defaultPriceCents: 6900,
    durationMinutes: 15,
    icon: "Footprints",
  },
  {
    id: "eczema-psoriasis",
    slug: "eczema-psoriasis",
    name: "Eczema & Psoriasis",
    shortDescription: "Soothe flares and manage chronic skin conditions.",
    description:
      "Ongoing management for eczema and psoriasis — prescription topicals, flare control, and a maintenance routine to keep skin calm.",
    defaultPriceCents: 7900,
    durationMinutes: 15,
    icon: "Leaf",
  },
];

export const SERVICE_MAP: Record<ServiceType, ServiceDefinition> = Object.fromEntries(
  SERVICES.map((s) => [s.id, s]),
) as Record<ServiceType, ServiceDefinition>;

export function getService(id: ServiceType): ServiceDefinition | undefined {
  return SERVICE_MAP[id];
}

export function getServiceBySlug(slug: string): ServiceDefinition | undefined {
  return SERVICES.find((s) => s.slug === slug);
}
