#!/usr/bin/env node
// Usage: node scripts/set-live-price.mjs 99
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

const dollars = Number(process.argv[2] || "99");
const cents = Math.round(dollars * 100);
await getFirestore()
  .collection("settings")
  .doc("live")
  .set({ realtimePriceCents: cents, updatedAt: Date.now() }, { merge: true });
console.log(`✓ Live Connect price set to $${dollars} (${cents} cents)`);
process.exit(0);
