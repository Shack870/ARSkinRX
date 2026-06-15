import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { rateLimit } from "@/lib/rate-limit";

/**
 * GET /api/providers/[id] — public, sanitized single provider profile.
 * Never exposes credentials (license) or Stripe ids.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = rateLimit(req, "provider", 60);
  if (limited) return limited;

  const { id } = await params;
  const snap = await adminDb.collection(COLLECTIONS.providers).doc(id).get();
  if (!snap.exists || snap.get("status") !== "approved") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const u = await adminDb.collection(COLLECTIONS.users).doc(id).get();
  return NextResponse.json({
    provider: {
      uid: id,
      displayName: u.get("displayName") ?? "ARSkinRX Provider",
      bio: snap.get("bio") ?? "",
      photoURL: snap.get("photoURL") ?? null,
      conditions: snap.get("conditions") ?? [],
      ratingAvg: snap.get("ratingAvg") ?? 0,
      ratingCount: snap.get("ratingCount") ?? 0,
    },
  });
}
