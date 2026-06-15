import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { getEffectiveService } from "@/lib/services-server";
import { rateLimit } from "@/lib/rate-limit";
import type { ServiceType } from "@/lib/types";

/**
 * GET /api/providers?serviceId=...
 * Public, sanitized list of approved providers for a service. Never exposes
 * credentials (license) or Stripe ids.
 */
export async function GET(req: Request) {
  const limited = rateLimit(req, "providers", 60);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId") as ServiceType | null;

  // Respect admin enable/disable for the requested service.
  const effective = serviceId ? await getEffectiveService(serviceId) : undefined;
  if (serviceId && effective && effective.enabled === false) {
    return NextResponse.json({ providers: [], disabled: true });
  }

  let q = adminDb
    .collection(COLLECTIONS.providers)
    .where("status", "==", "approved");
  if (serviceId) q = q.where("conditions", "array-contains", serviceId);

  const snap = await q.get();

  const providers = await Promise.all(
    snap.docs.map(async (d) => {
      const p = d.data();
      const userSnap = await adminDb
        .collection(COLLECTIONS.users)
        .doc(d.id)
        .get();
      const priceCents =
        (serviceId && p.priceOverrides?.[serviceId]) ??
        effective?.defaultPriceCents ??
        0;
      return {
        uid: d.id,
        displayName: userSnap.get("displayName") ?? "ARSkinRX Provider",
        bio: p.bio ?? "",
        photoURL: p.photoURL ?? null,
        conditions: p.conditions ?? [],
        ratingAvg: p.ratingAvg ?? 0,
        ratingCount: p.ratingCount ?? 0,
        priceCents,
      };
    }),
  );

  return NextResponse.json({ providers });
}
