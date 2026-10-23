import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { requireAdmin } from "@/lib/api-auth";
import { sendEmail, sendSms } from "@/lib/notify";
import { formatCurrency } from "@/lib/utils";

/** Visits split through Stripe Connect are never owed manually. */
function isStripeSplit(d: FirebaseFirestore.QueryDocumentSnapshot): boolean {
  return d.get("payoutVia") === "stripe" || Boolean(d.get("stripeTransferId"));
}

function netCents(d: FirebaseFirestore.QueryDocumentSnapshot): number {
  return (d.get("priceCents") ?? 0) - (d.get("platformFeeCents") ?? 0);
}

/**
 * GET /api/admin/payouts
 * Returns outstanding balances owed to each provider (net of platform fee) for
 * completed, not-yet-paid visits that were NOT split through Stripe Connect,
 * each nurse's payout mode (Auto via Stripe vs Manual), a summary of what
 * Stripe has already routed automatically, and recent manual payout history.
 */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [completedSnap, providersSnap] = await Promise.all([
    adminDb
      .collection(COLLECTIONS.appointments)
      .where("status", "==", "completed")
      .get(),
    adminDb.collection(COLLECTIONS.providers).get(),
  ]);

  const nameCache = new Map<string, Promise<string>>();
  const nameOf = (uid: string) => {
    let p = nameCache.get(uid);
    if (!p) {
      p = adminDb
        .collection(COLLECTIONS.users)
        .doc(uid)
        .get()
        .then((u) => (u.get("displayName") as string | undefined) ?? "—");
      nameCache.set(uid, p);
    }
    return p;
  };

  const payoutModeOf = new Map<string, "stripe" | "manual">();
  for (const p of providersSnap.docs) {
    payoutModeOf.set(
      p.id,
      p.get("stripeOnboardingComplete") === true ? "stripe" : "manual",
    );
  }

  const owed = new Map<
    string,
    { providerId: string; amountCents: number; visitCount: number }
  >();
  const auto = new Map<
    string,
    { providerId: string; amountCents: number; visitCount: number }
  >();
  for (const d of completedSnap.docs) {
    const providerId = d.get("providerId");
    if (isStripeSplit(d)) {
      const cur = auto.get(providerId) ?? { providerId, amountCents: 0, visitCount: 0 };
      cur.amountCents += netCents(d);
      cur.visitCount += 1;
      auto.set(providerId, cur);
      continue;
    }
    if (d.get("providerPaidAt")) continue;
    const cur = owed.get(providerId) ?? { providerId, amountCents: 0, visitCount: 0 };
    cur.amountCents += netCents(d);
    cur.visitCount += 1;
    owed.set(providerId, cur);
  }

  const outstanding = await Promise.all(
    Array.from(owed.values()).map(async (o) => ({
      ...o,
      providerName: await nameOf(o.providerId),
      payoutMode: payoutModeOf.get(o.providerId) ?? "manual",
    })),
  );
  const autoPaid = await Promise.all(
    Array.from(auto.values()).map(async (o) => ({
      ...o,
      providerName: await nameOf(o.providerId),
    })),
  );
  const providers = await Promise.all(
    providersSnap.docs
      .filter((p) => p.get("status") === "approved")
      .map(async (p) => ({
        providerId: p.id,
        providerName: await nameOf(p.id),
        payoutMode: payoutModeOf.get(p.id) ?? "manual",
        stripeAccountId: (p.get("stripeAccountId") as string | undefined) ?? null,
      })),
  );

  const historySnap = await adminDb
    .collection(COLLECTIONS.payouts)
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();
  const history = await Promise.all(
    historySnap.docs.map(async (d) => {
      return {
        id: d.id,
        providerName: await nameOf(d.get("providerId")),
        amountCents: d.get("amountCents"),
        method: d.get("method"),
        note: d.get("note") ?? "",
        visitCount: (d.get("appointmentIds") ?? []).length,
        createdAt: d.get("createdAt"),
      };
    }),
  );

  return NextResponse.json({ outstanding, autoPaid, providers, history });
}

/**
 * POST /api/admin/payouts { providerId, method, note }
 * Records a manual payout covering all of a provider's outstanding completed
 * visits, marks those visits paid, and notifies the provider (confirmation).
 */
export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { providerId, method, note } = await req.json().catch(() => ({}));
  if (!providerId || !method) {
    return NextResponse.json(
      { error: "providerId and method are required" },
      { status: 400 },
    );
  }

  const completedSnap = await adminDb
    .collection(COLLECTIONS.appointments)
    .where("providerId", "==", providerId)
    .where("status", "==", "completed")
    .get();

  // Only manually-owed visits: skip anything already split via Stripe Connect.
  const unpaid = completedSnap.docs.filter(
    (d) => !d.get("providerPaidAt") && !isStripeSplit(d),
  );
  if (unpaid.length === 0) {
    return NextResponse.json({ error: "Nothing outstanding" }, { status: 400 });
  }

  const amountCents = unpaid.reduce((sum, d) => sum + netCents(d), 0);
  const now = Date.now();
  const payoutRef = adminDb.collection(COLLECTIONS.payouts).doc();

  const batch = adminDb.batch();
  batch.set(payoutRef, {
    id: payoutRef.id,
    providerId,
    amountCents,
    appointmentIds: unpaid.map((d) => d.id),
    method: String(method),
    note: note ? String(note) : "",
    createdBy: admin.uid,
    createdAt: now,
  });
  for (const d of unpaid) {
    batch.update(d.ref, { providerPaidAt: now, payoutId: payoutRef.id });
  }
  batch.set(adminDb.collection(COLLECTIONS.auditLogs).doc(), {
    actorId: admin.uid,
    action: "payout.create",
    targetType: "provider",
    targetId: providerId,
    meta: { amountCents, visits: unpaid.length, method },
    timestamp: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  // Confirmation to the provider (best effort).
  try {
    const u = await adminDb.collection(COLLECTIONS.users).doc(providerId).get();
    const email = u.get("email");
    const phone = u.get("phone");
    const msg = `ARSkinRX: A payout of ${formatCurrency(amountCents)} for ${unpaid.length} visit(s) has been sent via ${method}.`;
    if (email)
      await sendEmail({
        to: email,
        subject: "Your ARSkinRX payout has been sent",
        html: `<p>${msg}</p>${note ? `<p>Note: ${note}</p>` : ""}`,
      });
    if (phone && u.get("smsOptIn") === true) {
      await sendSms({ to: phone, body: msg });
    }
  } catch {
    // non-critical
  }

  return NextResponse.json({ ok: true, amountCents, visits: unpaid.length });
}
