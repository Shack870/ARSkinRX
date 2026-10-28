import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { describeItem } from "@/lib/formulary";
import {
  rxDeclinedEmail,
  rxReminderEmail,
  rxReviewEmail,
  sendEmail,
  sendSms,
} from "@/lib/notify";
import { refundAppointment } from "@/lib/refunds-server";
import { getService } from "@/lib/services";
import type {
  PatientPharmacy,
  Prescription,
  PrescriptionItem,
  ServiceType,
} from "@/lib/types";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const REVIEW_SLA_MS = 24 * 60 * 60 * 1000;

/* ───────────────────────────── helpers ───────────────────────────── */

function cleanItem(raw: unknown): PrescriptionItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const drug = String(r.drug ?? "").trim();
  const strength = String(r.strength ?? "").trim();
  const sig = String(r.sig ?? "").trim();
  const quantity = String(r.quantity ?? "").trim();
  const refills = Number(r.refills ?? 0);
  if (!drug || !sig) return null;
  return {
    drug: drug.slice(0, 120),
    strength: strength.slice(0, 60),
    sig: sig.slice(0, 500),
    quantity: quantity.slice(0, 60),
    refills: Number.isInteger(refills) && refills >= 0 && refills <= 11 ? refills : 0,
  };
}

/** Validates a batch of items from the client. Returns null if any is invalid. */
export function parseItems(raw: unknown): PrescriptionItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 6) return null;
  const items: PrescriptionItem[] = [];
  for (const r of raw) {
    const it = cleanItem(r);
    if (!it) return null;
    items.push(it);
  }
  return items;
}

async function userName(uid: string): Promise<string> {
  const u = await adminDb.collection(COLLECTIONS.users).doc(uid).get();
  return (u.get("displayName") as string | undefined) ?? "—";
}

/** Everyone with admin rights — the prescriber(s) of record. */
async function adminRecipients(): Promise<
  { uid: string; email?: string; phone?: string }[]
> {
  const [a, b] = await Promise.all([
    adminDb.collection(COLLECTIONS.users).where("isAdmin", "==", true).get(),
    adminDb.collection(COLLECTIONS.users).where("role", "==", "admin").get(),
  ]);
  const seen = new Map<string, { uid: string; email?: string; phone?: string }>();
  for (const d of [...a.docs, ...b.docs]) {
    seen.set(d.id, {
      uid: d.id,
      email: d.get("email") ?? undefined,
      phone: d.get("phone") ?? undefined,
    });
  }
  return Array.from(seen.values());
}

async function pendingCount(): Promise<number> {
  const snap = await adminDb
    .collection(COLLECTIONS.prescriptions)
    .where("status", "==", "recommended")
    .count()
    .get();
  return snap.data().count;
}

/* ───────────────────────────── create ───────────────────────────── */

/**
 * Records the nurse's recommendation(s) for a completed visit. One doc per
 * drug. When the person completing the visit is themselves the prescriber
 * (admin), the items skip review and land directly in "approved".
 */
export async function createPrescriptionsForVisit(opts: {
  appointmentId: string;
  clientId: string;
  providerId: string;
  serviceId: ServiceType;
  items: PrescriptionItem[];
  reason: string;
  actor: { uid: string; isAdmin: boolean };
}): Promise<{ ids: string[]; autoApproved: boolean }> {
  const now = Date.now();
  const [actorName, clientSnap] = await Promise.all([
    userName(opts.actor.uid),
    adminDb.collection(COLLECTIONS.users).doc(opts.clientId).get(),
  ]);
  const pharmacy = (clientSnap.get("pharmacy") as PatientPharmacy | undefined) ?? null;
  const autoApproved = opts.actor.isAdmin;

  // Don't double-create if the complete call is retried.
  const existing = await adminDb
    .collection(COLLECTIONS.prescriptions)
    .where("appointmentId", "==", opts.appointmentId)
    .limit(1)
    .get();
  if (!existing.empty) {
    const all = await adminDb
      .collection(COLLECTIONS.prescriptions)
      .where("appointmentId", "==", opts.appointmentId)
      .get();
    return { ids: all.docs.map((d) => d.id), autoApproved };
  }

  const batch = adminDb.batch();
  const ids: string[] = [];
  for (const item of opts.items) {
    const ref = adminDb.collection(COLLECTIONS.prescriptions).doc();
    ids.push(ref.id);
    const doc: Prescription = {
      id: ref.id,
      appointmentId: opts.appointmentId,
      clientId: opts.clientId,
      providerId: opts.providerId,
      serviceId: opts.serviceId,
      status: autoApproved ? "approved" : "recommended",
      recommended: item,
      reason: opts.reason.slice(0, 500),
      recommendedBy: opts.actor.uid,
      recommendedByName: actorName,
      recommendedAt: now,
      pharmacy,
      createdAt: now,
      updatedAt: now,
      ...(autoApproved
        ? {
            final: item,
            reviewedBy: opts.actor.uid,
            reviewedByName: actorName,
            reviewedAt: now,
          }
        : {}),
    };
    batch.set(ref, doc);
  }
  batch.set(adminDb.collection(COLLECTIONS.auditLogs).doc(), {
    actorId: opts.actor.uid,
    action: autoApproved ? "rx.approve" : "rx.recommend",
    targetType: "appointment",
    targetId: opts.appointmentId,
    meta: { count: opts.items.length, prescriptionIds: ids },
    timestamp: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  if (!autoApproved) {
    try {
      const service = getService(opts.serviceId);
      const patientName = (clientSnap.get("displayName") as string | undefined) ?? "a patient";
      const pending = await pendingCount();
      const mail = rxReviewEmail({
        nurseName: actorName,
        patientName,
        serviceName: service?.name ?? opts.serviceId,
        items: opts.items.map(describeItem),
        pending,
      });
      const sms = `ARSkinRX: ${actorName} recommended an Rx for ${patientName}. ${pending} waiting for your review: ${APP_URL}/admin/prescriptions`;
      for (const r of await adminRecipients()) {
        if (r.email) await sendEmail({ to: r.email, ...mail });
        if (r.phone) await sendSms({ to: r.phone, body: sms });
      }
    } catch (err) {
      console.error("[rx] review notification failed", err);
    }
  }

  return { ids, autoApproved };
}

/* ───────────────────────────── transitions ───────────────────────────── */

export class RxStateError extends Error {}

export async function approvePrescription(
  id: string,
  finalItem: PrescriptionItem | null,
  actor: { uid: string },
): Promise<void> {
  const ref = adminDb.collection(COLLECTIONS.prescriptions).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new RxStateError("Prescription not found");
  const rx = snap.data() as Prescription;
  if (rx.status !== "recommended") {
    throw new RxStateError(`Already ${rx.status}`);
  }
  const now = Date.now();
  const actorName = await userName(actor.uid);
  const final = finalItem ?? rx.recommended;
  const edited = JSON.stringify(final) !== JSON.stringify(rx.recommended);

  const batch = adminDb.batch();
  batch.update(ref, {
    status: "approved",
    final,
    reviewedBy: actor.uid,
    reviewedByName: actorName,
    reviewedAt: now,
    updatedAt: now,
  });
  batch.set(adminDb.collection(COLLECTIONS.auditLogs).doc(), {
    actorId: actor.uid,
    action: "rx.approve",
    targetType: "prescription",
    targetId: id,
    meta: { appointmentId: rx.appointmentId, edited },
    timestamp: FieldValue.serverTimestamp(),
  });
  await batch.commit();
}

/**
 * Declines a recommendation. If this leaves the visit with no active
 * prescription (nothing approved/sent/still pending), the visit is refunded in
 * full. The nurse is told to call the patient; the patient is not messaged.
 */
export async function declinePrescription(
  id: string,
  reason: string,
  actor: { uid: string },
): Promise<{ refunded: boolean }> {
  const ref = adminDb.collection(COLLECTIONS.prescriptions).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new RxStateError("Prescription not found");
  const rx = snap.data() as Prescription;
  if (rx.status !== "recommended") {
    throw new RxStateError(`Already ${rx.status}`);
  }
  const cleanReason = reason.trim().slice(0, 500);
  if (!cleanReason) throw new RxStateError("A reason is required");

  const now = Date.now();
  const actorName = await userName(actor.uid);
  await ref.update({
    status: "declined",
    declineReason: cleanReason,
    reviewedBy: actor.uid,
    reviewedByName: actorName,
    reviewedAt: now,
    updatedAt: now,
  });

  // Refund only when nothing from this visit is going out.
  const siblings = await adminDb
    .collection(COLLECTIONS.prescriptions)
    .where("appointmentId", "==", rx.appointmentId)
    .get();
  const anyActive = siblings.docs.some(
    (d) => d.id !== id && d.get("status") !== "declined",
  );
  let refunded = false;
  if (!anyActive) {
    try {
      const r = await refundAppointment(rx.appointmentId, {
        reason: `Prescription declined: ${cleanReason}`,
        actorId: actor.uid,
      });
      refunded = Boolean(r.refundId);
    } catch (err) {
      console.error("[rx] refund on decline failed", err);
    }
  }

  await adminDb.collection(COLLECTIONS.auditLogs).add({
    actorId: actor.uid,
    action: "rx.decline",
    targetType: "prescription",
    targetId: id,
    meta: { appointmentId: rx.appointmentId, reason: cleanReason, refunded },
    timestamp: FieldValue.serverTimestamp(),
  });

  // Tell the nurse to call the patient.
  try {
    const [nurse, patient] = await Promise.all([
      adminDb.collection(COLLECTIONS.users).doc(rx.providerId).get(),
      adminDb.collection(COLLECTIONS.users).doc(rx.clientId).get(),
    ]);
    const patientName = (patient.get("displayName") as string) ?? "the patient";
    const patientPhone = (patient.get("phone") as string) ?? "";
    const mail = rxDeclinedEmail({
      nurseName: ((nurse.get("displayName") as string) ?? "there").split(" ")[0],
      patientName,
      patientPhone,
      item: describeItem(rx.recommended),
      reason: cleanReason,
      refunded,
      appointmentId: rx.appointmentId,
    });
    const email = nurse.get("email");
    if (email) await sendEmail({ to: email, ...mail });
    const phone = nurse.get("phone");
    if (phone && nurse.get("smsOptIn") === true) {
      await sendSms({
        to: phone,
        body: `ARSkinRX: Crystal declined your Rx for ${patientName} (${cleanReason.slice(0, 80)}). Please call them${patientPhone ? ` at ${patientPhone}` : ""}. Reply STOP to opt out.`,
      });
    }
  } catch (err) {
    console.error("[rx] decline notification failed", err);
  }

  return { refunded };
}

export async function markPrescriptionSent(
  id: string,
  via: string,
  actor: { uid: string },
): Promise<void> {
  const ref = adminDb.collection(COLLECTIONS.prescriptions).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new RxStateError("Prescription not found");
  const rx = snap.data() as Prescription;
  if (rx.status !== "approved") {
    throw new RxStateError(
      rx.status === "sent" ? "Already sent" : `Can't send: ${rx.status}`,
    );
  }
  const now = Date.now();
  const batch = adminDb.batch();
  batch.update(ref, {
    status: "sent",
    sentAt: now,
    sentBy: actor.uid,
    sentVia: via.trim().slice(0, 200),
    updatedAt: now,
  });
  batch.set(adminDb.collection(COLLECTIONS.auditLogs).doc(), {
    actorId: actor.uid,
    action: "rx.sent",
    targetType: "prescription",
    targetId: id,
    meta: { appointmentId: rx.appointmentId },
    timestamp: FieldValue.serverTimestamp(),
  });
  await batch.commit();
}

/* ───────────────────────────── reminders ───────────────────────────── */

/**
 * Called from the sweep. If any recommendation has waited longer than the
 * 24-hour promise and hasn't been nudged yet, remind the prescriber once per
 * item (the email/SMS summarizes the whole queue).
 */
export async function nudgeStaleRecommendations(now = Date.now()): Promise<number> {
  const snap = await adminDb
    .collection(COLLECTIONS.prescriptions)
    .where("status", "==", "recommended")
    .get();
  if (snap.empty) return 0;

  const stale = snap.docs.filter(
    (d) =>
      now - (d.get("recommendedAt") as number) > REVIEW_SLA_MS &&
      !d.get("reviewNudgedAt"),
  );
  if (stale.length === 0) return 0;

  const oldest = Math.min(...snap.docs.map((d) => d.get("recommendedAt") as number));
  const oldestHours = Math.round((now - oldest) / (60 * 60 * 1000));
  const mail = rxReminderEmail({ pending: snap.size, oldestHours });
  const sms = `ARSkinRX: ${snap.size} prescription${snap.size === 1 ? "" : "s"} waiting for your review (oldest ~${oldestHours}h). ${APP_URL}/admin/prescriptions`;
  for (const r of await adminRecipients()) {
    if (r.email) await sendEmail({ to: r.email, ...mail });
    if (r.phone) await sendSms({ to: r.phone, body: sms });
  }

  const batch = adminDb.batch();
  for (const d of stale) batch.update(d.ref, { reviewNudgedAt: now });
  await batch.commit();
  return stale.length;
}
