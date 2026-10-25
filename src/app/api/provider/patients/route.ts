import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import type { ProviderPatientSummary, ServiceType } from "@/lib/types";
import {
  EXCLUDED_STATUSES,
  NON_VISIT_STATUSES,
  ageFromDob,
  loadUsers,
  resolveProviderScope,
} from "./_lib";

/**
 * GET /api/provider/patients?q=&providerId=
 * The nurse's patient roster: everyone they've had a non-pending appointment
 * with, newest visit first. `q` filters by name / email / phone. Admins may
 * pass `providerId` to view another nurse's roster (or omit it for everyone).
 */
export async function GET(req: Request) {
  const scope = await resolveProviderScope(req);
  if (!scope.ok) return scope.res;
  const { providerId } = scope;

  let query: FirebaseFirestore.Query = adminDb.collection(COLLECTIONS.appointments);
  if (providerId) query = query.where("providerId", "==", providerId);
  const apptSnap = await query.get();

  type Agg = {
    visitCount: number;
    lastVisitAt: number | null;
    lastServiceId: ServiceType | null;
  };
  const byClient = new Map<string, Agg>();
  for (const d of apptSnap.docs) {
    const a = d.data();
    if (!a.clientId || EXCLUDED_STATUSES.has(a.status)) continue;
    const agg = byClient.get(a.clientId) ?? {
      visitCount: 0,
      lastVisitAt: null,
      lastServiceId: null,
    };
    if (!NON_VISIT_STATUSES.has(a.status)) agg.visitCount += 1;
    if (agg.lastVisitAt === null || a.start > agg.lastVisitAt) {
      agg.lastVisitAt = a.start;
      agg.lastServiceId = a.serviceId ?? null;
    }
    byClient.set(a.clientId, agg);
  }

  const users = await loadUsers([...byClient.keys()]);
  let patients: ProviderPatientSummary[] = [...byClient.entries()].map(
    ([uid, agg]) => {
      const u = users.get(uid) ?? {};
      const dob = typeof u.dob === "string" ? u.dob : null;
      return {
        uid,
        displayName: u.displayName ?? "Patient",
        email: u.email ?? "",
        phone: u.phone ?? "",
        dob,
        age: ageFromDob(dob),
        visitCount: agg.visitCount,
        lastVisitAt: agg.lastVisitAt,
        lastServiceId: agg.lastServiceId,
      };
    },
  );

  const q = new URL(req.url).searchParams.get("q")?.trim().toLowerCase();
  if (q) {
    const digits = q.replace(/\D/g, "");
    patients = patients.filter(
      (p) =>
        p.displayName.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        (digits.length > 0 && p.phone.replace(/\D/g, "").includes(digits)),
    );
  }

  patients.sort((a, b) => (b.lastVisitAt ?? 0) - (a.lastVisitAt ?? 0));

  return NextResponse.json({ patients, providerId });
}
