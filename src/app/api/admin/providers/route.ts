import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { requireAdmin } from "@/lib/api-auth";

/** GET /api/admin/providers — full provider list (with names + credentials). */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const snap = await adminDb
    .collection(COLLECTIONS.providers)
    .orderBy("createdAt", "desc")
    .get();

  const providers = await Promise.all(
    snap.docs.map(async (d) => {
      const p = d.data();
      const u = await adminDb.collection(COLLECTIONS.users).doc(d.id).get();
      return {
        uid: d.id,
        displayName: u.get("displayName") ?? "—",
        email: u.get("email") ?? "—",
        phone: u.get("phone") ?? "",
        licenseNumber: p.licenseNumber,
        conditions: p.conditions ?? [],
        status: p.status,
        stripeOnboardingComplete: p.stripeOnboardingComplete ?? false,
        createdAt: p.createdAt,
      };
    }),
  );

  return NextResponse.json({ providers });
}
