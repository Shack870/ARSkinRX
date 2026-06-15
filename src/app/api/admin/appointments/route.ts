import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { requireAdmin } from "@/lib/api-auth";

/** GET /api/admin/appointments — recent appointments with party names. */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const snap = await adminDb
    .collection(COLLECTIONS.appointments)
    .orderBy("start", "desc")
    .limit(100)
    .get();

  const nameCache = new Map<string, string>();
  async function name(uid: string) {
    if (nameCache.has(uid)) return nameCache.get(uid)!;
    const u = await adminDb.collection(COLLECTIONS.users).doc(uid).get();
    const n = u.get("displayName") ?? "—";
    nameCache.set(uid, n);
    return n;
  }

  const appointments = await Promise.all(
    snap.docs.map(async (d) => {
      const a = d.data();
      return {
        id: d.id,
        serviceId: a.serviceId,
        start: a.start,
        status: a.status,
        priceCents: a.priceCents,
        isLive: a.isLive === true,
        clientName: await name(a.clientId),
        providerName: await name(a.providerId),
      };
    }),
  );

  return NextResponse.json({ appointments });
}
