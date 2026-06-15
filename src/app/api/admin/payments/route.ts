import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { requireAdmin } from "@/lib/api-auth";

/** GET /api/admin/payments — recent payments with client/provider names. */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const snap = await adminDb
    .collection(COLLECTIONS.payments)
    .orderBy("createdAt", "desc")
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

  const payments = await Promise.all(
    snap.docs.map(async (d) => {
      const p = d.data();
      return {
        id: d.id,
        appointmentId: p.appointmentId,
        amountCents: p.amountCents,
        refundedCents: p.refundedCents ?? 0,
        status: p.status,
        createdAt: p.createdAt,
        clientName: await name(p.clientId),
        providerName: await name(p.providerId),
        isDev: String(p.stripePaymentIntentId ?? "").startsWith("dev_"),
      };
    }),
  );

  return NextResponse.json({ payments });
}
