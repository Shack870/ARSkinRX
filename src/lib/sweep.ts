import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { getService } from "@/lib/services";
import { sendEmail, sendSms, reminderEmail } from "@/lib/notify";
import { resolvePrefs } from "@/lib/notifications";
import { formatTime, formatDateTime } from "@/lib/datetime";
import type { NoShowParty, ServiceType } from "@/lib/types";

const HOUR = 60 * 60 * 1000;

function distanceLabel(untilMs: number): string {
  if (untilMs <= 12 * HOUR) return "today";
  const days = Math.round(untilMs / (24 * HOUR));
  if (days <= 1) return "tomorrow";
  return `in ${days} days`;
}

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

  // 2) Milestone email reminders (3-day, 1-day, day-of) + imminent SMS nudge,
  //    for booked visits in the next 4 days. Each milestone fires once and is
  //    gated by the patient's notification preferences.
  const upcomingSnap = await adminDb
    .collection(COLLECTIONS.appointments)
    .where("start", ">=", now)
    .where("start", "<=", now + 4 * 24 * HOUR)
    .get();

  const userCache = new Map<string, FirebaseFirestore.DocumentSnapshot>();
  async function clientDoc(uid: string) {
    if (userCache.has(uid)) return userCache.get(uid)!;
    const snap = await adminDb.collection(COLLECTIONS.users).doc(uid).get();
    userCache.set(uid, snap);
    return snap;
  }

  for (const docSnap of upcomingSnap.docs) {
    const a = docSnap.data();
    if (a.status !== "booked") continue;
    const until = a.start - now;
    const sent = a.remindersSent ?? {};
    const updates: Record<string, unknown> = {};

    try {
      const clientSnap = await clientDoc(a.clientId);
      const prefs = resolvePrefs(clientSnap.get("notificationPrefs"));
      const email = clientSnap.get("email");
      const phone = clientSnap.get("phone");
      const name = (clientSnap.get("displayName") ?? "there").split(" ")[0];
      const service = getService(a.serviceId as ServiceType);
      const serviceName = service?.name ?? "visit";
      const whenText = formatDateTime(a.start);

      async function fireMilestone(
        key: "threeDay" | "oneDay" | "dayOf",
        prefOn: boolean,
      ) {
        if (sent[key] || !prefOn) return;
        if (email) {
          await sendEmail({
            to: email,
            ...reminderEmail({
              name,
              serviceName,
              whenText,
              daysLabel: distanceLabel(until),
            }),
          });
        }
        updates[`remindersSent.${key}`] = now;
        reminders++;
      }

      if (until > 36 * HOUR && until <= 72 * HOUR) {
        await fireMilestone("threeDay", prefs.reminder3Day);
      } else if (until > 6 * HOUR && until <= 28 * HOUR) {
        await fireMilestone("oneDay", prefs.reminder1Day);
      } else if (until <= 12 * HOUR) {
        await fireMilestone("dayOf", prefs.reminderDayOf);
      }

      // Imminent SMS nudge (~15 min before), independent of email prefs.
      if (until <= 15 * 60 * 1000 && !a.reminderSentAt) {
        if (phone) {
          await sendSms({
            to: phone,
            body: `ARSkinRX: Your ${serviceName} starts at ${formatTime(a.start)}. Join from your dashboard.`,
          });
        }
        updates.reminderSentAt = now;
      }

      if (Object.keys(updates).length) await docSnap.ref.update(updates);
    } catch {
      // best effort
    }
  }

  return { noShows, reminders, expiredHolds };
}
