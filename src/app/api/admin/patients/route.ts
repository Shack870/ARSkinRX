import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { requireAdmin } from "@/lib/api-auth";

/** GET /api/admin/patients — list of client accounts. */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const snap = await adminDb
    .collection(COLLECTIONS.users)
    .where("role", "==", "client")
    .get();

  const patients = snap.docs
    .map((d) => ({
      uid: d.id,
      displayName: d.get("displayName") ?? "—",
      email: d.get("email") ?? "—",
      phone: d.get("phone") ?? "",
      createdAt: d.get("createdAt") ?? 0,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);

  return NextResponse.json({ patients });
}
