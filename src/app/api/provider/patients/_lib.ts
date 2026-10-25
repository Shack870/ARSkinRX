import "server-only";

import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { verifyBearer, type VerifiedUser } from "@/lib/api-auth";

/** Statuses that don't represent a real patient relationship yet. */
export const EXCLUDED_STATUSES = new Set(["pending_payment"]);
/** Statuses that count as an actual visit in the roster's visitCount. */
export const NON_VISIT_STATUSES = new Set([
  "pending_payment",
  "cancelled",
  "rescheduled",
]);

/**
 * Resolves who is asking and which nurse's roster they may see.
 * Providers see their own; admins may pass ?providerId= to view another's
 * (or omit it to see across all nurses).
 */
export async function resolveProviderScope(
  req: Request,
): Promise<
  | { ok: true; user: VerifiedUser; providerId: string | null }
  | { ok: false; res: NextResponse }
> {
  const user = await verifyBearer(req);
  if (!user) {
    return {
      ok: false,
      res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (user.role !== "provider" && !user.isAdmin) {
    return {
      ok: false,
      res: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  const url = new URL(req.url);
  const requested = url.searchParams.get("providerId");
  if (user.isAdmin) {
    return { ok: true, user, providerId: requested || null };
  }
  return { ok: true, user, providerId: user.uid };
}

/** Age in whole years from an ISO "YYYY-MM-DD" date of birth. */
export function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const [y, m, d] = dob.split("-").map(Number);
  const today = new Date();
  let age = today.getFullYear() - y;
  const hadBirthday =
    today.getMonth() + 1 > m ||
    (today.getMonth() + 1 === m && today.getDate() >= d);
  if (!hadBirthday) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/** Batched users/{uid} lookup → map of uid → profile data (or empty object). */
export async function loadUsers(uids: string[]) {
  const out = new Map<string, FirebaseFirestore.DocumentData>();
  if (!uids.length) return out;
  const refs = uids.map((u) => adminDb.collection(COLLECTIONS.users).doc(u));
  const snaps = await adminDb.getAll(...refs);
  for (const s of snaps) out.set(s.id, s.exists ? s.data()! : {});
  return out;
}
