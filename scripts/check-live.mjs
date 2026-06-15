#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function loadEnvLocal() {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnvLocal();
initializeApp({
  credential: cert(
    JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString(
        "utf8",
      ),
    ),
  ),
});
const db = getFirestore();
const now = Date.now();

console.log("=== presence ===");
const pres = await db.collection("presence").get();
if (pres.empty) console.log("(none)");
for (const d of pres.docs) {
  const p = d.data();
  const ageS = p.lastSeenAt ? Math.round((now - p.lastSeenAt) / 1000) : "n/a";
  console.log(
    `${d.id}  online=${p.online} busy=${p.busy} fresh=${ageS}s ago  conditions=${(p.conditions || []).join(",")}`,
  );
}

console.log("\n=== providers ===");
const provs = await db.collection("providers").get();
for (const d of provs.docs) {
  console.log(
    `${d.id}  status=${d.get("status")}  conditions=${(d.get("conditions") || []).join(",")}`,
  );
}

console.log("\n=== availability for hair-growth ===");
const q = await db
  .collection("presence")
  .where("online", "==", true)
  .where("conditions", "array-contains", "hair-growth")
  .get();
const fresh = q.docs.filter(
  (d) => d.get("busy") !== true && (d.get("lastSeenAt") || 0) > now - 30 * 60 * 1000,
);
console.log(`matched online docs: ${q.size}, fresh & free: ${fresh.length}`);
process.exit(0);
