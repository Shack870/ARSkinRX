import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { parseDob } from "@/lib/dob";
import type { PatientPharmacy } from "@/lib/types";

/**
 * Saves the prescriber-required details a patient enters at intake (date of
 * birth, preferred pharmacy) onto their profile so they're on file for every
 * visit and pre-filled next time. Ignores anything malformed; never throws.
 */
export async function savePatientDetailsFromIntake(
  uid: string,
  body: { dob?: unknown; pharmacy?: unknown },
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (typeof body.dob === "string" && parseDob(body.dob)) patch.dob = body.dob.trim();
  if (body.pharmacy && typeof body.pharmacy === "object") {
    const p = body.pharmacy as Record<string, unknown>;
    const name = String(p.name ?? "").trim().slice(0, 120);
    if (name) {
      const pharmacy: PatientPharmacy = {
        name,
        location: String(p.location ?? "").trim().slice(0, 160),
        phone: String(p.phone ?? "").trim().slice(0, 30),
      };
      patch.pharmacy = pharmacy;
    }
  }
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
