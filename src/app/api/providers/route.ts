import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { getEffectiveService } from "@/lib/services-server";
import { loadPool } from "@/lib/live-queue";
import { rateLimit } from "@/lib/rate-limit";
import type { ServiceType } from "@/lib/types";

/**
 * GET /api/providers?serviceId=...
 * Public, sanitized list of approved providers for a service. Never exposes
 * credentials (license) or Stripe ids.
 *
 * A provider is listed only if patients can actually reach them:
 *  - `bookable`: has at least one weekly availability window (scheduled visits)
 *  - `liveNow`: currently toggled Live for this service (No-Wait visits)
 * A nurse with no hours who isn't live is hidden entirely.
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

  const [snap, pool] = await Promise.all([q.get(), loadPool()]);
  const liveIds = new Set(
    pool
      .filter((n) => !serviceId || n.conditions.includes(serviceId))
      .map((n) => n.providerId),
  );

  const rows = await Promise.all(
    snap.docs.map(async (d) => {
      const p = d.data();
      const [userSnap, availSnap] = await Promise.all([
        adminDb.collection(COLLECTIONS.users).doc(d.id).get(),
        adminDb.collection(COLLECTIONS.availability).doc(d.id).get(),
      ]);
      const windows = (availSnap.get("windows") as unknown[] | undefined) ?? [];
      // Pricing is set centrally by admin (effective service price).
      const priceCents = effective?.defaultPriceCents ?? 0;
      return {
        uid: d.id,
        displayName: userSnap.get("displayName") ?? "ARSkinRX Provider",
        bio: p.bio ?? "",
        credentials: p.credentials ?? null,
        yearsExperience: p.yearsExperience ?? null,
        photoURL: p.photoURL ?? null,
        conditions: p.conditions ?? [],
        ratingAvg: p.ratingAvg ?? 0,
        ratingCount: p.ratingCount ?? 0,
        priceCents,
        bookable: windows.length > 0,
        liveNow: liveIds.has(d.id),
      };
    }),
  );

  // Live nurses first so a patient who wants to be seen now spots them.
  const providers = rows
    .filter((r) => r.bookable || r.liveNow)
    .sort((a, b) => Number(b.liveNow) - Number(a.liveNow));

  return NextResponse.json({ providers });
}
