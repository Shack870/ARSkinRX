import Link from "next/link";
import {
  Sparkles,
  Sun,
  Droplet,
  Flame,
  Scissors,
  Sprout,
  Footprints,
  Leaf,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { ServiceDefinition } from "@/lib/types";

const ICONS: Record<string, LucideIcon> = {
  Sparkles,
  Sun,
  Droplet,
  Flame,
  Scissors,
  Sprout,
  Footprints,
  Leaf,
};

/** A pleasant spread of accent tints across the service lines. */
const TINTS: Record<string, string> = {
  "anti-aging": "tint-violet",
  hyperpigmentation: "tint-amber",
  acne: "tint-sky",
  rosacea: "tint-rose",
  "hair-loss": "tint-teal",
  "hair-growth": "tint-emerald",
  "toe-nail-health": "tint-sky",
  "eczema-psoriasis": "tint-emerald",
};

export function ServiceCard({ service }: { service: ServiceDefinition }) {
  const Icon = ICONS[service.icon] ?? Sparkles;
  const tint = TINTS[service.id] ?? "tint-teal";
  return (
    <Link href={`/book?service=${service.slug}`} className="group">
      <Card className="h-full p-5 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:arx-glow">
        <div
          className={`mb-4 flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] ${tint}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="font-semibold tracking-tight">{service.name}</h3>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          {service.shortDescription}
        </p>
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="font-medium text-[var(--primary)]">
            {formatCurrency(service.defaultPriceCents)}
          </span>
          <span className="text-[var(--muted-foreground)]">
            {service.durationMinutes} min visit
          </span>
        </div>
      </Card>
    </Link>
  );
}
