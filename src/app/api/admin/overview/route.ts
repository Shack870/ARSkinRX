import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { requireAdmin } from "@/lib/api-auth";
import { LIVE_FRESH_MS } from "@/lib/live-server";

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const now = Date.now();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [providersSnap, pendingSnap, todaySnap, paymentsSnap] =
    await Promise.all([
      adminDb.collection(COLLECTIONS.providers).count().get(),
      adminDb
        .collection(COLLECTIONS.providers)
        .where("status", "==", "pending")
        .count()
        .get(),
      adminDb
        .collection(COLLECTIONS.appointments)
        .where("start", ">=", startOfDay.getTime())
        .where("start", "<", startOfDay.getTime() + 86400000)
        .count()
        .get(),
      adminDb
        .collection(COLLECTIONS.payments)
        .where("status", "==", "succeeded")
        .get(),
    ]);

  const grossCents = paymentsSnap.docs.reduce(
    (sum, d) => sum + (d.get("amountCents") ?? 0) - (d.get("refundedCents") ?? 0),
    0,
  );
  const platformCents = paymentsSnap.docs.reduce(
    (sum, d) => sum + (d.get("platformFeeCents") ?? 0),
    0,
  );

  // Amount currently owed to providers (completed, not yet paid out).
  const completedSnap = await adminDb
    .collection(COLLECTIONS.appointments)
    .where("status", "==", "completed")
    .get();
  const owedToProvidersCents = completedSnap.docs.reduce(
    (sum, d) =>
      d.get("providerPaidAt")
        ? sum
        : sum + ((d.get("priceCents") ?? 0) - (d.get("platformFeeCents") ?? 0)),
    0,
  );

  // Nurses currently live (online with a fresh heartbeat).
  const presenceSnap = await adminDb
    .collection(COLLECTIONS.presence)
    .where("online", "==", true)
    .get();
  const nursesOnline = presenceSnap.docs.filter(
    (d) => (d.get("lastSeenAt") ?? 0) > now - LIVE_FRESH_MS,
  ).length;

  return NextResponse.json({
    providers: providersSnap.data().count,
    pendingProviders: pendingSnap.data().count,
    appointmentsToday: todaySnap.data().count,
    grossCents,
    platformCents,
    owedToProvidersCents,
    nursesOnline,
    generatedAt: now,
  });
}
