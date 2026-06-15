#!/usr/bin/env node
// Seed demo data so analytics look populated. `node scripts/seed-demo.mjs`
// Remove it all with `node scripts/seed-demo.mjs clean`. All docs are tagged
// { demo: true } so cleanup is safe.
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of raw.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
initializeApp({
  credential: cert(
    JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8"),
    ),
  ),
});
const db = getFirestore();
const DEMO_PATIENT = "demo-patient-1";

async function clean() {
  for (const coll of ["appointments", "payments", "visitNotes", "intakeResponses"]) {
    const snap = await db.collection(coll).where("demo", "==", true).get();
    for (const d of snap.docs) await d.ref.delete();
    console.log(`${coll}: removed ${snap.size}`);
  }
  await db.collection("users").doc(DEMO_PATIENT).delete().catch(() => {});
  console.log("✓ demo data cleaned");
}

async function seed() {
  // Find an approved provider.
  const provSnap = await db
    .collection("providers")
    .where("status", "==", "approved")
    .limit(1)
    .get();
  if (provSnap.empty) {
    console.error("No approved provider found — approve one first.");
    process.exit(1);
  }
  const providerId = provSnap.docs[0].id;

  await db
    .collection("users")
    .doc(DEMO_PATIENT)
    .set({
      uid: DEMO_PATIENT,
      email: "demo.patient@example.com",
      displayName: "Demo Patient",
      phone: "(501) 555-0142",
      role: "client",
      state: "AR",
      demo: true,
      createdAt: Date.now() - 40 * 86400000,
      updatedAt: Date.now(),
    });

  const day = 86400000;
  const now = Date.now();
  const samples = [
    { svc: "acne", price: 6900, daysAgo: 2, status: "completed", paid: true, live: false },
    { svc: "hair-growth", price: 9900, daysAgo: 4, status: "completed", paid: true, live: true },
    { svc: "anti-aging", price: 7900, daysAgo: 9, status: "completed", paid: false, live: false },
    { svc: "rosacea", price: 6900, daysAgo: 15, status: "completed", paid: false, live: true },
    { svc: "toe-nail-health", price: 6900, daysAgo: 21, status: "completed", paid: true, live: false },
    { svc: "acne", price: 6900, daysAgo: 6, status: "no_show", paid: false, live: false },
    { svc: "anti-aging", price: 7900, daysAgo: 12, status: "cancelled", paid: false, live: false },
  ];

  for (const s of samples) {
    const id = randomUUID();
    const start = now - s.daysAgo * day;
    const fee = Math.round(s.price / 2);
    await db.collection("appointments").doc(id).set({
      id,
      clientId: DEMO_PATIENT,
      providerId,
      serviceId: s.svc,
      start,
      end: start + 15 * 60000,
      status: s.status,
      isLive: s.live,
      priceCents: s.price,
      platformFeeCents: fee,
      providerPaidAt: s.paid ? start + day : null,
      demo: true,
      createdAt: start - day,
      updatedAt: now,
    });
    if (s.status === "completed") {
      await db.collection("payments").doc(randomUUID()).set({
        appointmentId: id,
        clientId: DEMO_PATIENT,
        providerId,
        amountCents: s.price,
        platformFeeCents: fee,
        currency: "usd",
        stripePaymentIntentId: `dev_${id}`,
        status: "succeeded",
        refundedCents: 0,
        demo: true,
        createdAt: start,
        updatedAt: now,
      });
      await db.collection("visitNotes").doc(id).set({
        appointmentId: id,
        providerId,
        clientId: DEMO_PATIENT,
        subjective: "Patient reports the concern is improving.",
        assessment: `${s.svc} — stable, responding to treatment.`,
        plan: "Continue current regimen; follow up in 6 weeks.",
        prescribed: "As discussed (sent via e-prescribe).",
        demo: true,
        createdAt: start,
        updatedAt: start,
      });
    }
  }
  console.log(`✓ seeded ${samples.length} demo visits for provider ${providerId}`);
}

if (process.argv[2] === "clean") await clean();
else await seed();
process.exit(0);
