import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { requireAdmin } from "@/lib/api-auth";

/** GET /api/admin/audit — recent audit log entries with actor names. */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const snap = await adminDb
    .collection(COLLECTIONS.auditLogs)
    .orderBy("timestamp", "desc")
    .limit(100)
    .get();

  const nameCache = new Map<string, string>();
  async function name(uid: string) {
    if (!uid) return "system";
    if (nameCache.has(uid)) return nameCache.get(uid)!;
    const u = await adminDb.collection(COLLECTIONS.users).doc(uid).get();
    const n = u.get("displayName") ?? uid.slice(0, 6);
    nameCache.set(uid, n);
    return n;
  }

  const logs = await Promise.all(
    snap.docs.map(async (d) => {
      const ts = d.get("timestamp");
      const ms =
        ts && typeof ts.toMillis === "function"
          ? ts.toMillis()
          : typeof ts === "number"
            ? ts
            : 0;
      return {
        id: d.id,
        actor: await name(d.get("actorId")),
        action: d.get("action"),
        targetType: d.get("targetType"),
        targetId: d.get("targetId"),
        meta: d.get("meta") ?? null,
        timestamp: ms,
      };
    }),
  );

  return NextResponse.json({ logs });
}
