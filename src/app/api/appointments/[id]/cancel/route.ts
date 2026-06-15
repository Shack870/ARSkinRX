import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { verifyBearer } from "@/lib/api-auth";
import { getService } from "@/lib/services";
import { sendEmail, sendSms } from "@/lib/notify";
import { formatDateTime } from "@/lib/datetime";
import type { ServiceType } from "@/lib/types";

const REFUND_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * POST /api/appointments/[id]/cancel
 * Cancels a booked/pending visit. Either participant or an admin may cancel.
 * Refund eligibility follows clinic policy: a provider/admin cancellation is
 * always refund-eligible; a patient cancellation is eligible only if more than
 * 48 hours before the visit. Actual refunds are issued by an admin.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await verifyBearer(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const ref = adminDb.collection(COLLECTIONS.appointments).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const a = snap.data()!;
  const isClient = a.clientId === user.uid;
  const isProvider = a.providerId === user.uid;
  const isAdmin = user.role === "admin";
  if (!isClient && !isProvider && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!["booked", "pending_payment", "in_progress"].includes(a.status)) {
    return NextResponse.json(
      { error: "This visit can't be cancelled." },
      { status: 409 },
    );
  }

  const now = Date.now();
  const cancelledByRole = isClient ? "client" : isProvider ? "provider" : "admin";
  const refundEligible =
    cancelledByRole !== "client" || a.start - now > REFUND_WINDOW_MS;

  await ref.update({
    status: "cancelled",
    cancelledBy: cancelledByRole,
    cancelledAt: now,
    refundEligible,
    holdExpiresAt: null,
    updatedAt: now,
  });
  await adminDb.collection(COLLECTIONS.auditLogs).add({
    actorId: user.uid,
    action: "appointment.cancel",
    targetType: "appointment",
    targetId: id,
    meta: { by: cancelledByRole, refundEligible },
    timestamp: FieldValue.serverTimestamp(),
  });

  // Notify the other party (best effort).
  try {
    const service = getService(a.serviceId as ServiceType);
    const when = formatDateTime(a.start);
    const otherUid = isClient ? a.providerId : a.clientId;
    const other = await adminDb.collection(COLLECTIONS.users).doc(otherUid).get();
    const email = other.get("email");
    const phone = other.get("phone");
    const who = cancelledByRole === "client" ? "The patient" : "The provider";
    const msg = `ARSkinRX: ${who} cancelled the ${service?.name ?? "visit"} on ${when}.`;
    if (email)
      await sendEmail({ to: email, subject: "A visit was cancelled", html: `<p>${msg}</p>` });
    if (phone && other.get("smsOptIn") === true) {
      await sendSms({ to: phone, body: `${msg} Reply STOP to opt out.` });
    }
  } catch {
    // non-critical
  }

  return NextResponse.json({ ok: true, refundEligible });
}
