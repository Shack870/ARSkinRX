import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { requireAdmin } from "@/lib/api-auth";

interface ProviderAgg {
  providerId: string;
  name: string;
  completed: number;
  noShow: number;
  cancelled: number;
  live: number;
  grossCents: number;
  platformCents: number;
  earningsCents: number;
  paidOutCents: number;
  pendingCents: number;
  noShowRate: number;
}

/**
 * GET /api/admin/revenue
 * Combined platform revenue plus a per-nurse performance breakdown. Money is
 * tallied from completed visits (gross = price, platform = fee, nurse earnings
 * = price - fee), with status counts for performance.
 */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const snap = await adminDb.collection(COLLECTIONS.appointments).get();
  const map = new Map<string, ProviderAgg>();

  for (const doc of snap.docs) {
    const a = doc.data();
    const pid = a.providerId as string | undefined;
    if (!pid) continue;
    const e =
      map.get(pid) ??
      ({
        providerId: pid,
        name: "—",
        completed: 0,
        noShow: 0,
        cancelled: 0,
        live: 0,
        grossCents: 0,
        platformCents: 0,
        earningsCents: 0,
        paidOutCents: 0,
        pendingCents: 0,
        noShowRate: 0,
      } as ProviderAgg);

    if (a.status === "completed") {
      const price = a.priceCents ?? 0;
      const fee = a.platformFeeCents ?? 0;
      const net = price - fee;
      e.completed += 1;
      e.grossCents += price;
      e.platformCents += fee;
      e.earningsCents += net;
      if (a.providerPaidAt) e.paidOutCents += net;
      else e.pendingCents += net;
      if (a.isLive) e.live += 1;
    } else if (a.status === "no_show") {
      e.noShow += 1;
    } else if (a.status === "cancelled") {
      e.cancelled += 1;
    }
    map.set(pid, e);
  }

  const providers = await Promise.all(
    Array.from(map.values()).map(async (e) => {
      const u = await adminDb.collection(COLLECTIONS.users).doc(e.providerId).get();
      const denom = e.completed + e.noShow;
      return {
        ...e,
        name: u.get("displayName") ?? "—",
        noShowRate: denom > 0 ? e.noShow / denom : 0,
      };
    }),
  );
  providers.sort((a, b) => b.grossCents - a.grossCents);

  const totals = providers.reduce(
    (t, p) => ({
      grossCents: t.grossCents + p.grossCents,
      platformCents: t.platformCents + p.platformCents,
      earningsCents: t.earningsCents + p.earningsCents,
      completed: t.completed + p.completed,
      live: t.live + p.live,
    }),
    { grossCents: 0, platformCents: 0, earningsCents: 0, completed: 0, live: 0 },
  );

  return NextResponse.json({ totals, providers });
}
