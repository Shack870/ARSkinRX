import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { parseDob } from "@/lib/dob";

/**
 * Saves the prescriber-required details a patient enters at intake (date of
 * birth) onto their profile so they're on file for every visit and pre-filled
 * next time. Ignores anything malformed; never throws.
 */
export async function savePatientDetailsFromIntake(
  uid: string,
  body: { dob?: unknown },
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (typeof body.dob === "string" && parseDob(body.dob)) patch.dob = body.dob.trim();
  if (Object.keys(patch).length === 0) return;
  try {
    await adminDb
      .collection(COLLECTIONS.users)
      .doc(uid)
      .set({ ...patch, updatedAt: Date.now() }, { merge: true });
  } catch (err) {
    console.error("[intake] couldn't save patient details", err);
  }
}
