#!/usr/bin/env node
// One-time: recompute platformFeeCents to 50% on existing appointments & payments.
import { readFileSync } from "node:fs";
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
const half = (cents) => Math.round((cents || 0) / 2);

for (const coll of ["appointments", "payments"]) {
  const snap = await db.collection(coll).get();
  let updated = 0;
  for (const d of snap.docs) {
    const price = coll === "payments" ? d.get("amountCents") : d.get("priceCents");
    if (!price) continue;
    const fee = half(price);
    if (d.get("platformFeeCents") !== fee) {
      await d.ref.update({ platformFeeCents: fee, updatedAt: Date.now() });
      updated++;
    }
  }
  console.log(`${coll}: updated ${updated}/${snap.size}`);
}
process.exit(0);
