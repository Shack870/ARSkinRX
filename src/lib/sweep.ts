import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { getService } from "@/lib/services";
import { sendEmail, sendSms } from "@/lib/notify";
import { formatTime } from "@/lib/datetime";
import type { NoShowParty, ServiceType } from "@/lib/types";

export interface SweepResult {
  noShows: number;
  reminders: number;
  expiredHolds: number;
}

/**
 * Maintenance pass: releases expired holds, marks missed visits as no-show
 * (recording which party missed), and sends "starting soon" reminders.
 * Idempotent and safe to run frequently.
 */
export async function runSweep(): Promise<SweepResult> {
  const now = Date.now();
  let noShows = 0;
  let reminders = 0;
  let expiredHolds = 0;

  // 0) Release expired payment holds.
  const expiredSnap = await adminDb
    .collection(COLLECTIONS.appointments)
    .where("status", "==", "pending_payment")
    .where("holdExpiresAt", "<", now)
    .get();
  if (!expiredSnap.empty) {
    const releaseBatch = adminDb.batch();
    for (const d of expiredSnap.docs) {
      releaseBatch.update(d.ref, {
        status: "cancelled",
        holdExpiresAt: null,
        updatedAt: now,
      });
      expiredHolds++;
    }
    await releaseBatch.commit();
  }

  // 1) No-show detection for ended visits.
  const endedSnap = await adminDb
    .collection(COLLECTIONS.appointments)
    .where("end", "<", now)
    .get();
  const batch = adminDb.batch();
  for (const docSnap of endedSnap.docs) {
    const a = docSnap.data();
    if (!["booked", "in_progress"].includes(a.status)) continue;
    const clientJoined = !!a.joinedAt?.client;
    const providerJoined = !!a.joinedAt?.provider;
    if (clientJoined && providerJoined) {
      batch.update(docSnap.ref, { status: "completed", updatedAt: now });
      continue;
    }
    let party: NoShowParty = "client";
    if (clientJoined && !providerJoined) party = "provider";
    batch.update(docSnap.ref, {
      status: "no_show",
      noShowParty: party,
      updatedAt: now,
    });
    noShows++;
  }
  await batch.commit();

  // 2) Reminders for visits starting in the next ~15 minutes.
  const soonSnap = await adminDb
    .collection(COLLECTIONS.appointments)
    .where("start", ">=", now)
    .where("start", "<=", now + 15 * 60 * 1000)
    .get();
  for (const docSnap of soonSnap.docs) {
    const a = docSnap.data();
    if (a.status !== "booked" || a.reminderSentAt) continue;
    try {
      const clientSnap = await adminDb
        .collection(COLLECTIONS.users)
        .doc(a.clientId)
        .get();
      const service = getService(a.serviceId as ServiceType);
      const when = formatTime(a.start);
      const phone = clientSnap.get("phone");
      const email = clientSnap.get("email");
      const msg = `ARSkinRX: Your ${service?.name ?? "visit"} starts at ${when}. Join from your dashboard.`;
      if (phone) await sendSms({ to: phone, body: msg });
      if (email)
        await sendEmail({
          to: email,
          subject: "Your ARSkinRX visit is starting soon",
          html: `<p>${msg}</p>`,
        });
      await docSnap.ref.update({ reminderSentAt: now });
      reminders++;
    } catch {
      // best effort
    }
  }

  return { noShows, reminders, expiredHolds };
}
