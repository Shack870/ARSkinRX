import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { getService } from "@/lib/services";
import { generateSlots } from "@/lib/slots";
import { rateLimit } from "@/lib/rate-limit";
import type { ServiceType, ProviderAvailability } from "@/lib/types";

/**
 * GET /api/slots?providerId=...&serviceId=...
 * Returns open booking slots. Computed server-side so we can read the
 * provider's appointments (clients can't read those directly). Returns only
 * time ranges — no PHI.
 */
export async function GET(req: Request) {
  const limited = rateLimit(req, "slots", 60);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const providerId = searchParams.get("providerId");
  const serviceId = searchParams.get("serviceId") as ServiceType | null;

  if (!providerId || !serviceId) {
    return NextResponse.json(
      { error: "providerId and serviceId are required" },
      { status: 400 },
    );
  }
  const service = getService(serviceId);
  if (!service) {
    return NextResponse.json({ error: "Unknown service" }, { status: 400 });
  }

  const [availSnap, apptSnap] = await Promise.all([
    adminDb.collection(COLLECTIONS.availability).doc(providerId).get(),
    adminDb
      .collection(COLLECTIONS.appointments)
      .where("providerId", "==", providerId)
      .where("start", ">=", Date.now())
      .get(),
  ]);

  if (!availSnap.exists) return NextResponse.json({ slots: [] });
  const avail = availSnap.data() as ProviderAvailability;

  const now = Date.now();
  const busy = apptSnap.docs
    .map((d) => d.data())
    .filter((a) => {
      if (["cancelled", "no_show"].includes(a.status)) return false;
      // Ignore expired payment holds.
      if (a.status === "pending_payment" && (a.holdExpiresAt ?? 0) < now)
        return false;
      return true;
    })
    .map((a) => ({ start: a.start as number, end: a.end as number }));

  const slots = generateSlots({
    windows: avail.windows ?? [],
    timeZone: avail.timezone ?? "America/Chicago",
    durationMinutes: service.durationMinutes,
    busy,
    blackoutDates: avail.blackoutDates ?? [],
  });

  return NextResponse.json({ slots });
}
