import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { verifyBearer } from "@/lib/api-auth";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Finalizes a patient (client) account after the Firebase auth user is created
 * client-side. Creates the base user document and grants the `client` role
 * claim. Idempotent.
 */
export async function POST(req: Request) {
  const limited = rateLimit(req, "register", 10);
  if (limited) return limited;

  const user = await verifyBearer(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const displayName = String(body.displayName ?? "").trim();
  const phone = String(body.phone ?? "").trim();

  const userRef = adminDb.collection(COLLECTIONS.users).doc(user.uid);
  const existing = await userRef.get();

  // Don't clobber an existing provider/admin role.
  if (existing.exists && existing.get("role") !== "client") {
    return NextResponse.json({ ok: true, role: existing.get("role") });
  }

  const now = Date.now();
  await userRef.set(
    {
      uid: user.uid,
      email: user.email ?? "",
      displayName: displayName || user.email?.split("@")[0] || "Patient",
      phone,
      role: "client",
      state: "AR",
      createdAt: existing.exists ? existing.get("createdAt") ?? now : now,
      updatedAt: now,
    },
    { merge: true },
  );

  if (user.role !== "client") {
    await adminAuth.setCustomUserClaims(user.uid, { role: "client" });
  }

  return NextResponse.json({ ok: true, role: "client" });
}
