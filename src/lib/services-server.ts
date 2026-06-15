import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { SERVICES } from "@/lib/services";
import type { ServiceDefinition, ServiceType } from "@/lib/types";

export interface EffectiveService extends ServiceDefinition {
  enabled: boolean;
}

/**
 * Merges the code-defined service catalog with admin overrides stored in the
 * Firestore `services` collection ({ enabled, defaultPriceCents }). Overrides
 * are optional — anything not set falls back to the code defaults, so the
 * platform works with an empty collection.
 */
export async function getEffectiveServices(): Promise<EffectiveService[]> {
  const snap = await adminDb.collection(COLLECTIONS.services).get();
  const overrides = new Map<string, { enabled?: boolean; defaultPriceCents?: number }>();
  snap.docs.forEach((d) =>
    overrides.set(d.id, {
      enabled: d.get("enabled"),
      defaultPriceCents: d.get("defaultPriceCents"),
    }),
  );
  return SERVICES.map((s) => {
    const o = overrides.get(s.id);
    return {
      ...s,
      defaultPriceCents: o?.defaultPriceCents ?? s.defaultPriceCents,
      enabled: o?.enabled ?? true,
    };
  });
}

export async function getEffectiveService(
  id: ServiceType,
): Promise<EffectiveService | undefined> {
  const all = await getEffectiveServices();
  return all.find((s) => s.id === id);
}
