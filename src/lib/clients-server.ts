import "server-only";

import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";

export interface ClientLookup {
  uid: string;
  email: string;
  displayName: string;
  /** True when this call created the account. */
  created: boolean;
  /** True when the account exists but has never had a password set. */
  needsPassword: boolean;
}

/**
 * Finds the client account for an email, or creates one with no password.
 * Used by guest booking ("book first, set a password after paying") and by
 * admin manual bookings. Never downgrades an existing provider/admin.
 */
export async function findOrCreateClient(opts: {
  email: string;
  displayName?: string;
  phone?: string;
  consent?: boolean;
  createdVia: "booking" | "admin";
}): Promise<ClientLookup> {
  const email = opts.email.trim().toLowerCase();
  const displayName = (opts.displayName ?? "").trim();
  const phone = (opts.phone ?? "").trim();
  const now = Date.now();

  // Existing auth user?
  try {
    const existing = await adminAuth.getUserByEmail(email);
    const docRef = adminDb.collection(COLLECTIONS.users).doc(existing.uid);
    const snap = await docRef.get();
    if (!snap.exists) {
      // Auth user without a profile doc (rare) — backfill a client profile.
      await docRef.set({
        uid: existing.uid,
        email,
        displayName: displayName || existing.displayName || email.split("@")[0],
        phone,
        role: "client",
        state: "AR",
        passwordSet: true,
        createdVia: opts.createdVia,
        createdAt: now,
        updatedAt: now,
      });
      if (!existing.customClaims?.role) {
        await adminAuth.setCustomUserClaims(existing.uid, { role: "client" });
      }
    }
    return {
      uid: existing.uid,
      email,
      displayName: snap.get("displayName") ?? displayName,
      created: false,
      needsPassword: snap.exists ? snap.get("passwordSet") === false : false,
    };
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code !== "auth/user-not-found") throw e;
  }

  // Create a password-less account; the patient sets a password after paying.
  const user = await adminAuth.createUser({
    email,
    displayName: displayName || undefined,
    emailVerified: false,
  });
  await adminAuth.setCustomUserClaims(user.uid, { role: "client" });
  await adminDb.collection(COLLECTIONS.users).doc(user.uid).set({
    uid: user.uid,
    email,
    displayName: displayName || email.split("@")[0],
    phone,
    role: "client",
    state: "AR",
    smsOptIn: false,
    smsOptInAt: null,
    consentAcceptedAt: opts.consent ? now : null,
    passwordSet: false,
    createdVia: opts.createdVia,
    createdAt: now,
    updatedAt: now,
  });

  return {
    uid: user.uid,
    email,
    displayName: displayName || email.split("@")[0],
    created: true,
    needsPassword: true,
  };
}
