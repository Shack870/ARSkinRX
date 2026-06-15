import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { providerApplicationSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Completes a provider (APRN) application.
 *
 * The client creates the Firebase auth account first, then calls this with a
 * fresh ID token plus the application data. We verify the token, create the
 * base user + provider profile documents, and grant the `provider` role claim.
 * The provider starts in `pending` status until an admin approves them.
 */
export async function POST(req: Request) {
  const limited = rateLimit(req, "apply", 10);
  if (limited) return limited;

  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!idToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let uid: string;
  let email: string | undefined;
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    uid = decoded.uid;
    email = decoded.email;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = providerApplicationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const data = parsed.data;

  // Prevent re-applying / role escalation if already a provider.
  const existing = await adminDb.collection(COLLECTIONS.providers).doc(uid).get();
  if (existing.exists) {
    return NextResponse.json(
      { error: "An application already exists for this account" },
      { status: 409 },
    );
  }

  const now = Date.now();
  const batch = adminDb.batch();

  const userRef = adminDb.collection(COLLECTIONS.users).doc(uid);
  batch.set(
    userRef,
    {
      uid,
      email: email ?? "",
      displayName: data.displayName,
      phone: data.phone,
      role: "provider",
      state: "AR",
      createdAt: now,
      updatedAt: now,
    },
    { merge: true },
  );

  const providerRef = adminDb.collection(COLLECTIONS.providers).doc(uid);
  batch.set(providerRef, {
    uid,
    licenseNumber: data.licenseNumber,
    bio: data.bio,
    conditions: data.conditions,
    attestations: {
      followsArkansasNursingRules: true,
      hasPrescriptiveAuthority: true,
      agreesToTerms: true,
      attestedAt: now,
    },
    status: "pending",
    stripeOnboardingComplete: false,
    ratingAvg: 0,
    ratingCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  const auditRef = adminDb.collection(COLLECTIONS.auditLogs).doc();
  batch.set(auditRef, {
    actorId: uid,
    action: "provider.apply",
    targetType: "provider",
    targetId: uid,
    timestamp: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  // Grant the provider role via custom claims.
  await adminAuth.setCustomUserClaims(uid, { role: "provider" });

  return NextResponse.json({ ok: true, status: "pending" });
}
